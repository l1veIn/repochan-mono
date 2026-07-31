/**
 * Cross-platform filesystem compatibility layer.
 *
 * Windows raises transient failure modes that POSIX never hits:
 *
 *  - `rename` / `unlink` / `rm` on a file that antivirus is scanning, or that
 *    a handle is still closing, fails with `EPERM` / `EBUSY` / `EACCES` /
 *    `ENOTEMPTY` even though the operation is perfectly valid.
 *  - `fsync` on a handle opened read-only (and on directory handles) fails
 *    with `EPERM`.
 *
 * These clear within milliseconds, so a short bounded retry is the correct
 * strategy. POSIX is left completely unchanged (no retry, no added latency),
 * so the Linux/macOS behavior — where the same error codes are usually
 * deterministic permission failures — stays byte-for-byte the same.
 */
import { promises as fs } from "node:fs";

const RETRYABLE_CODES = new Set(["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"]);
const MAX_ATTEMPTS = 12;
const BASE_DELAY_MS = 25;
const MAX_DELAY_MS = 200;

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a filesystem operation, retrying the transient lock errors Windows
 * raises while antivirus or a closing handle still holds the path. Non-Windows
 * platforms call the operation once, unchanged. Non-transient errors are
 * rethrown immediately.
 */
export async function retryFs<T>(operation: () => Promise<T>): Promise<T> {
  if (process.platform !== "win32") return operation();
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!RETRYABLE_CODES.has(errorCode(error) ?? "")) throw error;
      if (attempt < MAX_ATTEMPTS - 1) await sleep(Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS));
    }
  }
  throw lastError;
}

/** Atomically replace `target` with `source`, retrying Windows transient locks. */
export function renameReplacing(source: string, target: string): Promise<void> {
  return retryFs(() => fs.rename(source, target));
}

/** Recursively remove a path, retrying Windows transient locks. */
export function removeRecursive(target: string): Promise<void> {
  return retryFs(() => fs.rm(target, { recursive: true, force: true }));
}

/** Remove a single file, retrying Windows transient locks. */
export function unlinkFile(target: string): Promise<void> {
  return retryFs(() => fs.unlink(target));
}
