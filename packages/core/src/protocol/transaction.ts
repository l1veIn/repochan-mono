import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertNoProtocolSymlinkPath } from "./path-safety.js";
import { withOrderMutationLock } from "./order-lock.js";
import { removeRecursive, renameReplacing } from "../platform/fs.js";

type Snapshot = {
  target: string;
  existed: boolean;
  backup: string;
};

type TransactionIntent = {
  schemaVersion: "repochan.protocol-transaction.v1";
  transactionId: string;
  owner: LockOwner;
  targets: string[];
};

type TransactionManifest = TransactionIntent & {
  state: "prepared";
  snapshots: Array<{ target: string; existed: boolean; backup: string }>;
};

type LockOwner = {
  pid: number;
  hostname: string;
  nonce: string;
  startedAt: string;
};

const OWNER_FILE = "owner.json";
const OWNERLESS_STALE_MS = 30_000;

async function durableJson(file: string, value: unknown): Promise<void> {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await fs.open(temp, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await renameReplacing(temp, file);
  try {
    const dir = await fs.open(path.dirname(file), "r");
    try { await dir.sync(); } finally { await dir.close(); }
  } catch {
    // Directory fsync is unavailable on some supported platforms.
  }
}

async function syncPath(target: string): Promise<void> {
  const stat = await fs.lstat(target).catch(() => undefined);
  if (!stat) return;
  if (stat.isSymbolicLink()) throw new Error(`Protocol transaction refuses symlink target: ${target}`);
  if (stat.isDirectory()) {
    const entries = await fs.readdir(target);
    for (const entry of entries) await syncPath(path.join(target, entry));
  } else if (stat.isFile()) {
    // Windows cannot fsync read-only handles (EPERM). The file bytes were
    // already synced before atomic publish, so this barrier is best-effort.
    try {
      const handle = await fs.open(target, "r");
      try { await handle.sync(); } finally { await handle.close(); }
    } catch {
      // Best effort on platforms that cannot fsync read-only handles.
    }
  }
  try {
    const handle = await fs.open(stat.isDirectory() ? target : path.dirname(target), "r");
    try { await handle.sync(); } finally { await handle.close(); }
  } catch {
    // Best effort on platforms that cannot fsync directories.
  }
}

function withoutNestedTargets(targets: string[]): string[] {
  const resolved = [...new Set(targets.map((target) => path.resolve(target)))].sort((a, b) => a.length - b.length);
  return resolved.filter((target, index) => !resolved.slice(0, index).some((parent) => target.startsWith(`${parent}${path.sep}`)));
}

function protocolEntity(target: string): { root: string; entity: string; orderId?: string } {
  const resolved = path.resolve(target);
  const segments = resolved.split(path.sep);
  const index = segments.lastIndexOf(".repochan");
  if (index < 0 || !segments[index + 1]) throw new Error(`Protocol transaction target is outside .repochan: ${target}`);
  const entity = segments[index + 1];
  const orderId = entity === "orders" ? segments[index + 2] : undefined;
  if (entity === "orders" && !orderId) throw new Error(`Order transaction target must identify one order: ${target}`);
  return { root: segments.slice(0, index + 1).join(path.sep) || path.sep, entity, orderId };
}

function transactionProtocolRoot(targets: string[]): string {
  const roots = [...new Set(targets.map((target) => protocolEntity(target).root))];
  if (roots.length !== 1) throw new Error("Protocol transaction targets must share one .repochan root.");
  return roots[0];
}

function resolveTransactionTarget(protocolRoot: string, relative: string): string {
  if (!relative || path.isAbsolute(relative)) throw new Error("Protocol transaction target must be relative.");
  const resolved = path.resolve(protocolRoot, relative);
  if (resolved === path.resolve(protocolRoot) || !resolved.startsWith(`${path.resolve(protocolRoot)}${path.sep}`)) {
    throw new Error(`Protocol transaction target escapes .repochan: ${relative}`);
  }
  return resolved;
}

function parseIntent(value: unknown, transactionId: string): TransactionIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid protocol transaction intent: ${transactionId}`);
  const input = value as Partial<TransactionIntent>;
  if (input.schemaVersion !== "repochan.protocol-transaction.v1" || input.transactionId !== transactionId ||
      !input.owner || typeof input.owner.nonce !== "string" || !Array.isArray(input.targets) ||
      !input.targets.length || input.targets.some((target) => typeof target !== "string")) {
    throw new Error(`Invalid protocol transaction intent: ${transactionId}`);
  }
  return input as TransactionIntent;
}

function parseManifest(value: unknown, intent: TransactionIntent): TransactionManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid protocol transaction manifest: ${intent.transactionId}`);
  const input = value as Partial<TransactionManifest>;
  if (input.schemaVersion !== intent.schemaVersion || input.transactionId !== intent.transactionId ||
      input.owner?.nonce !== intent.owner.nonce || input.state !== "prepared" || !Array.isArray(input.snapshots) ||
      input.snapshots.length !== intent.targets.length) {
    throw new Error(`Invalid protocol transaction manifest: ${intent.transactionId}`);
  }
  for (const [index, snapshot] of input.snapshots.entries()) {
    if (!snapshot || snapshot.target !== intent.targets[index] || typeof snapshot.existed !== "boolean" || snapshot.backup !== `backups/${index}`) {
      throw new Error(`Invalid protocol transaction snapshot: ${intent.transactionId}/${index}`);
    }
  }
  return input as TransactionManifest;
}

async function restoreSnapshots(protocolRoot: string, transactionRoot: string, manifest: TransactionManifest): Promise<void> {
  for (const snapshot of [...manifest.snapshots].reverse()) {
    const target = resolveTransactionTarget(protocolRoot, snapshot.target);
    const backup = path.resolve(transactionRoot, snapshot.backup);
    if (!backup.startsWith(`${path.resolve(transactionRoot)}${path.sep}`)) throw new Error("Protocol transaction backup escapes its root.");
    await assertNoProtocolSymlinkPath(target);
    await removeRecursive(target);
    if (snapshot.existed) {
      const stat = await fs.lstat(backup);
      if (!stat.isFile() && !stat.isDirectory()) throw new Error(`Invalid protocol transaction backup: ${backup}`);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.cp(backup, target, { recursive: stat.isDirectory(), preserveTimestamps: true });
      await syncPath(target);
    }
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function readLockOwner(lockDir: string): Promise<LockOwner | undefined> {
  try {
    const value = JSON.parse(await fs.readFile(path.join(lockDir, OWNER_FILE), "utf8")) as Partial<LockOwner>;
    if (typeof value.pid !== "number" || typeof value.hostname !== "string" || typeof value.nonce !== "string" || typeof value.startedAt !== "string") {
      return undefined;
    }
    return value as LockOwner;
  } catch {
    return undefined;
  }
}

async function acquireEntityLock(protocolRoot: string, entity: string): Promise<() => Promise<void>> {
  const locksRoot = path.join(protocolRoot, ".locks");
  const lockDir = path.join(locksRoot, `${entity}.lock`);
  await assertNoProtocolSymlinkPath(lockDir);
  await fs.mkdir(locksRoot, { recursive: true });
  await assertNoProtocolSymlinkPath(locksRoot);

  const owner: LockOwner = { pid: process.pid, hostname: os.hostname(), nonce: randomUUID(), startedAt: new Date().toISOString() };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await fs.mkdir(lockDir);
      await fs.writeFile(path.join(lockDir, OWNER_FILE), `${JSON.stringify(owner, null, 2)}\n`, { flag: "wx" });
      return async () => {
        const current = await readLockOwner(lockDir);
        if (current?.nonce === owner.nonce) await removeRecursive(lockDir);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        await removeRecursive(lockDir).catch(() => undefined);
        throw error;
      }
      const current = await readLockOwner(lockDir);
      const stat = await fs.stat(lockDir).catch(() => undefined);
      const ownerlessStale = !current && stat && Date.now() - stat.mtimeMs >= OWNERLESS_STALE_MS;
      const sameHostDead = current?.hostname === os.hostname() && !processIsAlive(current.pid);
      if (attempt === 0 && (ownerlessStale || sameHostDead)) {
        await removeRecursive(lockDir);
        continue;
      }
      const holder = current ? `pid ${current.pid} on ${current.hostname}` : "an unverified owner";
      throw new Error(`Protocol ${entity} mutation is already active (${holder}). Retry after it completes.`);
    }
  }
  throw new Error(`Unable to acquire protocol ${entity} mutation lock.`);
}

async function withEntityLocks<T>(targets: string[], action: () => Promise<T>): Promise<T> {
  const lockSpecs = [...new Map(
    targets
      .map(protocolEntity)
      .map((spec) => [`${spec.root}\0${spec.entity}\0${spec.orderId ?? ""}`, spec]),
  ).values()].sort((a, b) => `${a.root}/${a.entity}/${a.orderId ?? ""}`.localeCompare(`${b.root}/${b.entity}/${b.orderId ?? ""}`));

  async function acquireAt(index: number): Promise<T> {
    const spec = lockSpecs[index];
    if (!spec) return action();
    if (spec.entity === "orders" && spec.orderId) {
      return withOrderMutationLock(path.dirname(spec.root), spec.orderId, "protocol transaction", () => acquireAt(index + 1));
    }
    const release = await acquireEntityLock(spec.root, spec.entity);
    try {
      return await acquireAt(index + 1);
    } finally {
      await release().catch(() => undefined);
    }
  }

  return acquireAt(0);
}

/**
 * Run a multi-path protocol mutation as one recoverable operation.
 *
 * Each managed path is snapshotted before the action starts. If any write,
 * rename, or unlink fails, every managed file/directory is restored byte-for-
 * byte to its entry state (including restoring absence). Callers must include
 * every path they mutate. Non-order entity locks are acquired here; order
 * callers use the stronger per-order recoverable mutation lock.
 */
export async function withProtocolRollback<T>(targets: string[], action: () => Promise<T>): Promise<T> {
  const managed = withoutNestedTargets(targets);
  if (!managed.length) throw new Error("Protocol transaction requires at least one managed target.");
  for (const target of managed) await assertNoProtocolSymlinkPath(target);
  const protocolRoot = transactionProtocolRoot(managed);
  return withEntityLocks(managed, async () => {
    const transactionsRoot = path.join(protocolRoot, ".transactions");
    await fs.mkdir(transactionsRoot, { recursive: true });
    await assertNoProtocolSymlinkPath(transactionsRoot);
    const transactionId = `txn-${randomUUID()}`;
    const transactionRoot = path.join(transactionsRoot, transactionId);
    const backupsRoot = path.join(transactionRoot, "backups");
    await fs.mkdir(backupsRoot, { recursive: true });
    const owner: LockOwner = { pid: process.pid, hostname: os.hostname(), nonce: randomUUID(), startedAt: new Date().toISOString() };
    const relativeTargets = managed.map((target) => path.relative(protocolRoot, target).split(path.sep).join("/"));
    const intent: TransactionIntent = {
      schemaVersion: "repochan.protocol-transaction.v1",
      transactionId,
      owner,
      targets: relativeTargets,
    };
    await durableJson(path.join(transactionRoot, "intent.json"), intent);
    const snapshots: Snapshot[] = [];
    try {
      for (const [index, target] of managed.entries()) {
        await assertNoProtocolSymlinkPath(target);
        const backup = path.join(backupsRoot, String(index));
        const stat = await fs.lstat(target).catch(() => undefined);
        if (stat && !stat.isFile() && !stat.isDirectory()) {
          throw new Error(`Protocol transaction supports only regular files and directories: ${target}`);
        }
        if (stat) {
          await fs.cp(target, backup, { recursive: stat.isDirectory(), preserveTimestamps: true });
          await syncPath(backup);
        }
        snapshots.push({ target, existed: Boolean(stat), backup });
      }
      const manifest: TransactionManifest = {
        ...intent,
        state: "prepared",
        snapshots: snapshots.map((snapshot, index) => ({
          target: relativeTargets[index],
          existed: snapshot.existed,
          backup: `backups/${index}`,
        })),
      };
      await durableJson(path.join(transactionRoot, "manifest.json"), manifest);
      const result = await action();
      for (const target of managed) await syncPath(target);
      await durableJson(path.join(transactionRoot, "committed.json"), { transactionId, nonce: owner.nonce });
      await removeRecursive(transactionRoot).catch(() => undefined);
      return result;
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      try {
        const manifestFile = path.join(transactionRoot, "manifest.json");
        const manifestExists = await fs.lstat(manifestFile).then((stat) => stat.isFile()).catch(() => false);
        if (manifestExists) {
          const manifest = parseManifest(JSON.parse(await fs.readFile(manifestFile, "utf8")), intent);
          await restoreSnapshots(protocolRoot, transactionRoot, manifest);
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
      if (rollbackErrors.length) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          `Protocol transaction failed and durable rollback is pending at ${transactionRoot}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      await removeRecursive(transactionRoot).catch(() => undefined);
      throw error;
    }
  });
}

/** Recover transactions left by a process exit before the operation committed. */
export async function recoverProtocolTransactions(protocolRoot: string): Promise<void> {
  const transactionsRoot = path.join(protocolRoot, ".transactions");
  await assertNoProtocolSymlinkPath(transactionsRoot);
  const entries = await fs.readdir(transactionsRoot, { withFileTypes: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const transactionRoot = path.join(transactionsRoot, entry.name);
    if (!entry.isDirectory() || entry.isSymbolicLink() || !/^txn-[0-9a-f-]+$/.test(entry.name)) {
      throw new Error(`Invalid protocol transaction entry: ${transactionRoot}`);
    }
    await assertNoProtocolSymlinkPath(transactionRoot);
    const intentRaw = await fs.readFile(path.join(transactionRoot, "intent.json"), "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    });
    // The action cannot start until intent.json has been durably published.
    // A crash before that point leaves only disposable transaction scaffolding.
    if (intentRaw === undefined) {
      await removeRecursive(transactionRoot);
      continue;
    }
    const intent = parseIntent(JSON.parse(intentRaw), entry.name);
    const targets = intent.targets.map((target) => resolveTransactionTarget(protocolRoot, target));
    for (const target of targets) await assertNoProtocolSymlinkPath(target);
    await withEntityLocks(targets, async () => {
      const committed = await fs.readFile(path.join(transactionRoot, "committed.json"), "utf8")
        .then((raw) => JSON.parse(raw) as { transactionId?: string; nonce?: string })
        .catch(() => undefined);
      if (committed?.transactionId === intent.transactionId && committed.nonce === intent.owner.nonce) {
        await removeRecursive(transactionRoot);
        return;
      }
      const manifestRaw = await fs.readFile(path.join(transactionRoot, "manifest.json"), "utf8").catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      });
      if (manifestRaw !== undefined) {
        const manifest = parseManifest(JSON.parse(manifestRaw), intent);
        await restoreSnapshots(protocolRoot, transactionRoot, manifest);
      }
      await removeRecursive(transactionRoot);
    });
  }
}
