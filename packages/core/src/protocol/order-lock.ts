import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { assertNoProtocolSymlinkPath } from "./path-safety.js";
import { removeRecursive, renameReplacing } from "../platform/fs.js";

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

/**
 * Atomically claim the lock directory, retrying the transient EPERM/EBUSY that
 * Windows raises while antivirus still holds the just-written candidate.
 *
 * The collision case is classified by `lockDir` existence rather than errno:
 * POSIX surfaces a held lock as EEXIST/ENOTEMPTY, but Windows reports the same
 * collision as EPERM/EBUSY. Returns `false` when another holder won the lock
 * between our check and rename.
 */
async function acquireLockRename(candidate: string, lockDir: string): Promise<boolean> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await fs.rename(candidate, lockDir);
      return true;
    } catch (error) {
      if (await fs.stat(lockDir).then(() => true).catch(() => false)) return false;
      const code = errorCode(error);
      if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES" && code !== "ENOTEMPTY") throw error;
      if (attempt === 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  return false;
}

function orderLockRoot(projectRoot: string, orderId: string): string {
  if (!/^ord-[a-z0-9][a-z0-9-]*$/.test(orderId)) throw new Error("orderId must match ^ord-[a-z0-9][a-z0-9-]*$.");
  return path.join(projectRoot, ".repochan", ".locks", "orders", orderId);
}

export async function withOrderMutationLock<T>(
  projectRoot: string,
  orderId: string,
  operation: string,
  action: () => Promise<T>,
): Promise<T> {
  const locksRoot = orderLockRoot(projectRoot, orderId);
  await assertNoProtocolSymlinkPath(locksRoot);
  await fs.mkdir(locksRoot, { recursive: true });
  await assertNoProtocolSymlinkPath(locksRoot);
  const lockDir = path.join(locksRoot, "mutation.lock");
  const nonce = randomUUID();
  const owner = {
    schemaVersion: "repochan.order-mutation-lock.v1",
    pid: process.pid,
    hostname: hostname(),
    operation,
    nonce,
    startedAt: new Date().toISOString(),
  };
  let acquired = false;
  for (let attempt = 0; attempt < 2 && !acquired; attempt++) {
    const candidate = await fs.mkdtemp(path.join(locksRoot, ".candidate-"));
    await fs.writeFile(path.join(candidate, "owner.json"), `${JSON.stringify(owner, null, 2)}\n`, "utf8");
    let renameError: unknown;
    try {
      acquired = await acquireLockRename(candidate, lockDir);
    } catch (error) {
      renameError = error;
    }
    if (!acquired) {
      await removeRecursive(candidate).catch(() => undefined);
      // Classify the collision by lockDir existence, not errno: Windows reports
      // a held lock as EPERM/EBUSY rather than the POSIX EEXIST/ENOTEMPTY.
      if (!(await fs.stat(lockDir).then(() => true).catch(() => false))) throw renameError;
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
        const staleDir = path.join(locksRoot, `.stale-${process.pid}-${Date.now()}`);
        await renameReplacing(lockDir, staleDir).catch(() => undefined);
        await removeRecursive(staleDir).catch(() => undefined);
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
    const current = await fs.readFile(path.join(lockDir, "owner.json"), "utf8")
      .then((raw) => JSON.parse(raw) as { nonce?: string })
      .catch(() => undefined);
    if (current?.nonce === nonce) await removeRecursive(lockDir).catch(() => undefined);
  }
}
