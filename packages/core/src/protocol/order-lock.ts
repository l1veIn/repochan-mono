import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { assertNoProtocolSymlinkPath } from "./path-safety.js";

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
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
        const staleDir = path.join(locksRoot, `.stale-${process.pid}-${Date.now()}`);
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
    const current = await fs.readFile(path.join(lockDir, "owner.json"), "utf8")
      .then((raw) => JSON.parse(raw) as { nonce?: string })
      .catch(() => undefined);
    if (current?.nonce === nonce) await fs.rm(lockDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
