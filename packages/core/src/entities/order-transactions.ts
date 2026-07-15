import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { orderDir } from "../protocol/index.js";

export type RecoveryEntry = {
  destination: string;
  backup: string;
  kind: "file" | "directory";
  existedBefore: boolean;
  beforeSha256?: string;
};

export type OrderRecoveryManifest = {
  schemaVersion: "repochan.order-recovery.v1";
  transactionId: string;
  orderId: string;
  kind: "result_publish" | "candidate_promotion" | "version_metadata";
  nonce: string;
  versionId: string;
  previousVersionId?: string;
  state: "prepared" | "recovery_required";
  entries: RecoveryEntry[];
  failure?: string;
};

export type OrderTransactionIdentity = {
  schemaVersion: "repochan.order-transaction-identity.v1";
  transactionId: string;
  orderId: string;
  kind: OrderRecoveryManifest["kind"];
  nonce: string;
  versionId: string;
  previousVersionId?: string;
};

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

async function assertNoSymlinkComponents(root: string, target: string, label: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  const parts = relative.split(path.sep).filter(Boolean);
  let current = resolvedRoot;
  for (const part of ["", ...parts]) {
    if (part) current = path.join(current, part);
    const stat = await fs.lstat(current).catch(() => undefined);
    if (stat?.isSymbolicLink()) throw new Error(`${label} refuses symlink path: ${current}`);
  }
}

async function resolveInside(root: string, relative: string, label: string): Promise<string> {
  if (!relative || path.isAbsolute(relative)) throw new Error(`${label} must be a non-empty relative path.`);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, relative);
  if (resolved === resolvedRoot || !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`${label} escapes its transaction root: ${relative}`);
  }
  await assertNoSymlinkComponents(resolvedRoot, resolved, label);
  return resolved;
}

async function pathKind(target: string): Promise<"file" | "directory" | undefined> {
  const stat = await fs.lstat(target).catch(() => undefined);
  if (!stat) return undefined;
  if (stat.isSymbolicLink()) throw new Error(`Recovery refuses symlink path: ${target}`);
  if (stat.isFile()) return "file";
  if (stat.isDirectory()) return "directory";
  throw new Error(`Recovery supports only regular files and directories: ${target}`);
}

async function sha256Path(target: string, kind: "file" | "directory"): Promise<string> {
  const hash = createHash("sha256");
  if (kind === "file") {
    hash.update(await fs.readFile(target));
    return hash.digest("hex");
  }
  async function walk(dir: string, prefix = ""): Promise<void> {
    const entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Recovery refuses symlink path: ${absolute}`);
      if (entry.isDirectory()) {
        hash.update(`directory\0${relative}\0`);
        await walk(absolute, relative);
      } else if (entry.isFile()) {
        hash.update(`file\0${relative}\0`);
        hash.update(await fs.readFile(absolute));
      } else {
        throw new Error(`Recovery supports only regular files and directories: ${absolute}`);
      }
    }
  }
  await walk(target);
  return hash.digest("hex");
}

async function writeManifest(transactionRoot: string, manifest: OrderRecoveryManifest): Promise<void> {
  const target = path.join(transactionRoot, "recovery.json");
  const staged = path.join(transactionRoot, ".recovery.json.tmp");
  await fs.writeFile(staged, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.rename(staged, target);
}

function identityPath(projectRoot: string, orderId: string, transactionId: string) {
  return path.join(orderDir(projectRoot, orderId), ".transactions", `${transactionId}.json`);
}

export async function registerOrderTransaction(
  projectRoot: string,
  orderId: string,
  transactionRoot: string,
  kind: OrderTransactionIdentity["kind"],
  versionId: string,
  previousVersionId?: string,
): Promise<OrderTransactionIdentity> {
  const transactionId = path.basename(transactionRoot);
  validateTransactionId(transactionId);
  const identity: OrderTransactionIdentity = {
    schemaVersion: "repochan.order-transaction-identity.v1",
    transactionId,
    orderId,
    kind,
    nonce: randomUUID(),
    versionId,
    ...(previousVersionId ? { previousVersionId } : {}),
  };
  const file = identityPath(projectRoot, orderId, transactionId);
  await assertNoSymlinkComponents(projectRoot, orderDir(projectRoot, orderId), "Transaction identity order root");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(identity, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return identity;
}

export async function createOrderTransaction(
  projectRoot: string,
  orderId: string,
  kind: OrderTransactionIdentity["kind"],
  versionId: string,
  previousVersionId?: string,
) {
  const prefix = kind === "result_publish" ? ".result-txn-" : kind === "candidate_promotion" ? ".promotion-txn-" : ".metadata-txn-";
  const transactionRoot = path.join(orderDir(projectRoot, orderId), `${prefix}${randomUUID()}`);
  const identity = await registerOrderTransaction(projectRoot, orderId, transactionRoot, kind, versionId, previousVersionId);
  try {
    await fs.mkdir(transactionRoot);
    return { transactionRoot, identity };
  } catch (error) {
    await removeOrderTransactionIdentity(projectRoot, orderId, identity.transactionId).catch(() => undefined);
    throw error;
  }
}

export async function removeOrderTransactionIdentity(projectRoot: string, orderId: string, transactionId: string): Promise<void> {
  await fs.rm(identityPath(projectRoot, orderId, transactionId), { force: true });
}

async function readOrderTransactionIdentity(projectRoot: string, orderId: string, transactionId: string): Promise<OrderTransactionIdentity> {
  const file = identityPath(projectRoot, orderId, transactionId);
  const root = orderDir(projectRoot, orderId);
  await assertNoSymlinkComponents(projectRoot, root, "Transaction identity order root");
  await assertNoSymlinkComponents(root, file, "Transaction identity");
  const stat = await fs.lstat(file).catch(() => undefined);
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error(`Untrusted recovery transaction ${transactionId}: Core identity anchor is missing.`);
  const identity = JSON.parse(await fs.readFile(file, "utf8")) as OrderTransactionIdentity;
  if (
    identity.schemaVersion !== "repochan.order-transaction-identity.v1" || identity.transactionId !== transactionId ||
    identity.orderId !== orderId || !["result_publish", "candidate_promotion", "version_metadata"].includes(identity.kind) ||
    typeof identity.nonce !== "string" || !identity.nonce || typeof identity.versionId !== "string" || !identity.versionId
  ) {
    throw new Error(`Invalid Core transaction identity for ${orderId}/${transactionId}.`);
  }
  return identity;
}

export async function withOrderMutationLock<T>(
  projectRoot: string,
  orderId: string,
  operation: string,
  action: () => Promise<T>,
): Promise<T> {
  const dir = orderDir(projectRoot, orderId);
  await fs.mkdir(dir, { recursive: true });
  const lockDir = path.join(dir, ".order-mutation.lock");
  const owner = {
    schemaVersion: "repochan.order-mutation-lock.v1",
    pid: process.pid,
    hostname: hostname(),
    operation,
    startedAt: new Date().toISOString(),
  };
  let acquired = false;
  for (let attempt = 0; attempt < 2 && !acquired; attempt++) {
    const candidate = await fs.mkdtemp(path.join(dir, ".order-mutation-lock-candidate-"));
    await fs.writeFile(path.join(candidate, "owner.json"), `${JSON.stringify(owner, null, 2)}\n`, "utf8");
    try {
      await fs.rename(candidate, lockDir);
      acquired = true;
    } catch (error) {
      await fs.rm(candidate, { recursive: true, force: true }).catch(() => undefined);
      if (errorCode(error) !== "EEXIST" && errorCode(error) !== "ENOTEMPTY") throw error;
      const existingOwner = await fs.readFile(path.join(lockDir, "owner.json"), "utf8")
        .then((raw) => JSON.parse(raw) as typeof owner)
        .catch(() => undefined);
      const lockStat = await fs.stat(lockDir).catch(() => undefined);
      let stale = false;
      if (existingOwner?.hostname === hostname() && Number.isInteger(existingOwner.pid)) {
        try {
          process.kill(existingOwner.pid, 0);
        } catch (probeError) {
          stale = errorCode(probeError) === "ESRCH";
        }
      } else if (!existingOwner && lockStat && Date.now() - lockStat.mtimeMs > 5 * 60_000) {
        stale = true;
      }
      if (stale) {
        const staleDir = path.join(dir, `.order-mutation-lock-stale-${process.pid}-${Date.now()}`);
        await fs.rename(lockDir, staleDir).catch(() => undefined);
        await fs.rm(staleDir, { recursive: true, force: true }).catch(() => undefined);
        continue;
      }
      const detail = existingOwner
        ? `owner pid=${existingOwner.pid} host=${existingOwner.hostname} operation=${existingOwner.operation}`
        : "owner metadata is unavailable; ownerless locks are automatically reclaimed after 5 minutes";
      throw new Error(`Order ${orderId} mutation conflict during ${operation}: another order mutation is publishing (${detail}). Retry the command.`);
    }
  }
  if (!acquired) throw new Error(`Order ${orderId} mutation conflict during ${operation}: could not acquire the order lock.`);
  try {
    return await action();
  } finally {
    await fs.rm(lockDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function assertOrderBytesUnchanged(orderFile: string, expected: Buffer, operation: string): Promise<void> {
  const current = await fs.readFile(orderFile).catch(() => undefined);
  if (!current?.equals(expected)) {
    throw new Error(`${operation} conflict: order.json changed after the transaction started; the newer order mutation was preserved.`);
  }
}

export async function prepareRecoveryManifest(
  projectRoot: string,
  orderId: string,
  transactionRoot: string,
  identity: OrderTransactionIdentity,
  entries: Array<{ destination: string; backup: string; kind: RecoveryEntry["kind"] }>,
): Promise<OrderRecoveryManifest> {
  const root = orderDir(projectRoot, orderId);
  await assertNoSymlinkComponents(projectRoot, root, "Recovery order root");
  if (identity.orderId !== orderId || identity.transactionId !== path.basename(transactionRoot)) {
    throw new Error("Transaction identity does not match the recovery manifest destination.");
  }
  const manifestEntries: RecoveryEntry[] = [];
  for (const entry of entries) {
    const destination = path.relative(root, entry.destination).split(path.sep).join("/");
    const absolute = await resolveInside(root, destination, "Recovery destination");
    const existingKind = await pathKind(absolute);
    if (existingKind && existingKind !== entry.kind) {
      throw new Error(`Recovery destination kind mismatch for ${destination}.`);
    }
    manifestEntries.push({
      destination,
      backup: entry.backup,
      kind: entry.kind,
      existedBefore: existingKind !== undefined,
      ...(existingKind ? { beforeSha256: await sha256Path(absolute, existingKind) } : {}),
    });
  }
  const manifest: OrderRecoveryManifest = {
    schemaVersion: "repochan.order-recovery.v1",
    transactionId: path.basename(transactionRoot),
    orderId,
    kind: identity.kind,
    nonce: identity.nonce,
    versionId: identity.versionId,
    ...(identity.previousVersionId ? { previousVersionId: identity.previousVersionId } : {}),
    state: "prepared",
    entries: manifestEntries,
  };
  await writeManifest(transactionRoot, manifest);
  return manifest;
}

export async function markRecoveryRequired(transactionRoot: string, manifest: OrderRecoveryManifest, failure: string): Promise<void> {
  await writeManifest(transactionRoot, { ...manifest, state: "recovery_required", failure });
}

function validateTransactionId(transactionId: string): string {
  if (!/^\.(result|promotion|metadata)-txn-[A-Za-z0-9._-]+$/.test(transactionId) || path.basename(transactionId) !== transactionId) {
    throw new Error("Recovery transaction id must be the basename of a .result-txn-*, .promotion-txn-*, or .metadata-txn-* directory.");
  }
  return transactionId;
}

async function readRecoveryManifest(projectRoot: string, orderId: string, transactionId: string) {
  const id = validateTransactionId(transactionId);
  const root = orderDir(projectRoot, orderId);
  await assertNoSymlinkComponents(projectRoot, root, "Recovery order root");
  const transactionRoot = await resolveInside(root, id, "Recovery transaction");
  const manifestPath = await resolveInside(transactionRoot, "recovery.json", "Recovery manifest");
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as OrderRecoveryManifest;
  const identity = await readOrderTransactionIdentity(projectRoot, orderId, id);
  const validEntries = Array.isArray(raw.entries) && raw.entries.every((entry) =>
    entry && typeof entry.destination === "string" && typeof entry.backup === "string" &&
    (entry.kind === "file" || entry.kind === "directory") && typeof entry.existedBefore === "boolean" &&
    (!entry.existedBefore || typeof entry.beforeSha256 === "string"),
  );
  const destinations = validEntries ? raw.entries.map((entry) => entry.destination) : [];
  const uniqueDestinations = new Set(destinations).size === destinations.length;
  const resultShape = validEntries && raw.kind === "result_publish" && raw.entries.length === 2 &&
    raw.entries.some((entry) => entry.destination === "order.json" && entry.backup === "previous-order.json" && entry.kind === "file") &&
    raw.entries.some((entry) => entry.destination === `versions/${raw.versionId}` && entry.backup === "previous-version" && entry.kind === "directory");
  const targetMetaDestination = `versions/${raw.versionId}/meta.json`;
  const previousMetaDestination = raw.previousVersionId ? `versions/${raw.previousVersionId}/meta.json` : undefined;
  const promotionShape = validEntries && raw.kind === "candidate_promotion" && raw.entries.length === (previousMetaDestination ? 3 : 2) &&
    raw.entries.some((entry) => entry.destination === "order.json" && entry.backup === "order.json.bak" && entry.kind === "file") &&
    raw.entries.some((entry) => entry.destination === targetMetaDestination && entry.backup === "target-meta.json.bak" && entry.kind === "file") &&
    (!previousMetaDestination || raw.entries.some((entry) => entry.destination === previousMetaDestination && entry.backup === "previous-meta.json.bak" && entry.kind === "file"));
  const metadataShape = validEntries && raw.kind === "version_metadata" && raw.entries.length === 2 &&
    raw.entries.some((entry) => entry.destination === "order.json" && entry.backup === "order.json.bak" && entry.kind === "file") &&
    raw.entries.some((entry) => entry.destination === targetMetaDestination && entry.backup === "meta.json.bak" && entry.kind === "file");
  if (
    raw.schemaVersion !== "repochan.order-recovery.v1" || raw.orderId !== orderId || raw.transactionId !== id ||
    raw.kind !== identity.kind || raw.nonce !== identity.nonce || raw.versionId !== identity.versionId ||
    raw.previousVersionId !== identity.previousVersionId ||
    (raw.state !== "prepared" && raw.state !== "recovery_required") || !validEntries || !uniqueDestinations ||
    (!resultShape && !promotionShape && !metadataShape)
  ) {
    throw new Error(`Invalid recovery manifest for ${orderId}/${id}.`);
  }
  return { transactionRoot, manifest: raw, identity };
}

async function recoveryTransactionRoot(projectRoot: string, orderId: string, transactionId: string) {
  const id = validateTransactionId(transactionId);
  const root = orderDir(projectRoot, orderId);
  await assertNoSymlinkComponents(projectRoot, root, "Recovery order root");
  const transactionRoot = await resolveInside(root, id, "Recovery transaction");
  const stat = await fs.lstat(transactionRoot).catch(() => undefined);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new Error(`Recovery transaction does not exist: ${orderId}/${id}.`);
  const identity = await readOrderTransactionIdentity(projectRoot, orderId, id);
  return { id, transactionRoot, identity };
}

export async function listOrderRecoveryTransactions(projectRoot: string, orderId: string) {
  const dir = orderDir(projectRoot, orderId);
  await assertNoSymlinkComponents(projectRoot, dir, "Recovery order root");
  const entries = (await fs.readdir(dir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory() && (entry.name.startsWith(".result-txn-") || entry.name.startsWith(".promotion-txn-") || entry.name.startsWith(".metadata-txn-")))
    .map((entry) => entry.name)
    .sort();
  const recoveries = [];
  for (const transactionId of entries) {
    try {
      const { manifest } = await readRecoveryManifest(projectRoot, orderId, transactionId);
      recoveries.push(manifest);
    } catch (error) {
      const manifestStat = await fs.lstat(path.join(dir, transactionId, "recovery.json")).catch(() => undefined);
      const manifestExists = manifestStat?.isFile() && !manifestStat.isSymbolicLink();
      const identityValid = await readOrderTransactionIdentity(projectRoot, orderId, transactionId).then(() => true).catch(() => false);
      recoveries.push(!manifestExists && identityValid
        ? { transactionId, state: "staging_unprepared", action: "abort_only" }
        : { transactionId, invalid: true, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { orderId, recoveries };
}

export async function recoverOrderTransaction(
  projectRoot: string,
  orderId: string,
  transactionId: string,
  validators?: {
    before?: (manifest: OrderRecoveryManifest, originalPaths: Record<string, string>) => Promise<void>;
    after?: (manifest: OrderRecoveryManifest, restoredPaths: Record<string, string>) => Promise<void>;
  },
) {
  const { transactionRoot } = await recoveryTransactionRoot(projectRoot, orderId, transactionId);
  const manifestStat = await fs.lstat(path.join(transactionRoot, "recovery.json")).catch(() => undefined);
  const manifestExists = manifestStat?.isFile() && !manifestStat.isSymbolicLink();
  if (!manifestExists) {
    throw new Error(`Recovery transaction ${transactionId} has not entered publication; use recovery abort to discard its staging directory.`);
  }
  const { manifest } = await readRecoveryManifest(projectRoot, orderId, transactionId);
  return withOrderMutationLock(projectRoot, orderId, "order.recovery.recover", async () => {
    const orderRoot = orderDir(projectRoot, orderId);
    const changed: Array<{ destination: string; backup: string; hold?: string; restoredBackup: boolean }> = [];
    try {
      const originalPaths: Record<string, string> = {};
      for (const entry of manifest.entries) {
        const destination = await resolveInside(orderRoot, entry.destination, "Recovery destination");
        const backup = await resolveInside(transactionRoot, entry.backup, "Recovery backup");
        originalPaths[entry.destination] = (await pathKind(backup)) ? backup : destination;
      }
      await validators?.before?.(manifest, originalPaths);
      for (const [index, entry] of manifest.entries.entries()) {
        const destination = await resolveInside(orderRoot, entry.destination, "Recovery destination");
        const backup = await resolveInside(transactionRoot, entry.backup, "Recovery backup");
        const backupKind = await pathKind(backup);
        if (backupKind) {
          if (backupKind !== entry.kind) throw new Error(`Recovery backup kind mismatch for ${entry.destination}.`);
          const hold = (await pathKind(destination)) ? path.join(transactionRoot, `.recover-current-${index}`) : undefined;
          if (hold) await fs.rename(destination, hold);
          const item = { destination, backup, hold, restoredBackup: false };
          changed.push(item);
          await fs.rename(backup, destination);
          item.restoredBackup = true;
        } else if (entry.existedBefore) {
          const currentKind = await pathKind(destination);
          if (currentKind !== entry.kind || await sha256Path(destination, entry.kind) !== entry.beforeSha256) {
            throw new Error(`Cannot recover ${entry.destination}: backup is missing and destination is not the original state.`);
          }
        } else {
          const currentKind = await pathKind(destination);
          if (currentKind) {
            const hold = path.join(transactionRoot, `.recover-current-${index}`);
            await fs.rename(destination, hold);
            changed.push({ destination, backup, hold, restoredBackup: false });
          }
        }
      }
      for (const entry of manifest.entries) {
        const destination = await resolveInside(orderRoot, entry.destination, "Recovery destination");
        const currentKind = await pathKind(destination);
        if (!entry.existedBefore) {
          if (currentKind) throw new Error(`Recovery verification failed: ${entry.destination} should be absent.`);
        } else if (currentKind !== entry.kind || await sha256Path(destination, entry.kind) !== entry.beforeSha256) {
          throw new Error(`Recovery verification failed for ${entry.destination}.`);
        }
      }
      const restoredPaths = Object.fromEntries(manifest.entries.map((entry) => [entry.destination, path.join(orderRoot, entry.destination)]));
      await validators?.after?.(manifest, restoredPaths);
      const completed = path.join(orderRoot, `.recovery-completed-${transactionId.slice(1)}`);
      await fs.rename(transactionRoot, completed);
      await removeOrderTransactionIdentity(projectRoot, orderId, transactionId).catch(() => undefined);
      await fs.rm(completed, { recursive: true, force: true }).catch(() => undefined);
      return { orderId, transactionId, action: "recovered" as const };
    } catch (error) {
      for (const item of changed.reverse()) {
        if (item.restoredBackup) await fs.rename(item.destination, item.backup).catch(() => undefined);
        if (item.hold) await fs.rename(item.hold, item.destination).catch(() => undefined);
      }
      throw error;
    }
  });
}

export async function abortOrderTransaction(
  projectRoot: string,
  orderId: string,
  transactionId: string,
  validateCurrentState: () => Promise<void>,
) {
  const { transactionRoot } = await recoveryTransactionRoot(projectRoot, orderId, transactionId);
  return withOrderMutationLock(projectRoot, orderId, "order.recovery.abort", async () => {
    const orderFile = await resolveInside(orderDir(projectRoot, orderId), "order.json", "Recovery order state");
    await validateCurrentState();
    await fs.readFile(orderFile, "utf8").then(JSON.parse).catch(() => {
      throw new Error("Cannot abort recovery: current order.json is missing or invalid. Run recovery recover instead.");
    });
    const discarded = path.join(orderDir(projectRoot, orderId), `.recovery-aborted-${transactionId.slice(1)}`);
    await fs.rename(transactionRoot, discarded);
    await removeOrderTransactionIdentity(projectRoot, orderId, transactionId).catch(() => undefined);
    await fs.rm(discarded, { recursive: true, force: true }).catch(() => undefined);
    return { orderId, transactionId, action: "aborted" as const };
  });
}
