import { promises as fs } from "node:fs";

/**
 * Create a directory symlink for security tests.
 *
 * On Windows, plain `fs.symlink` for a directory requires Developer Mode or an
 * elevated prompt. Directory *junctions* need no privilege at all and are
 * reported by `lstat` as symbolic links, so the protocol guards under test
 * behave identically to a real symlink. POSIX keeps the plain symlink.
 */
export async function symlinkDir(target: string, linkPath: string): Promise<void> {
  if (process.platform === "win32") {
    await fs.symlink(target, linkPath, "junction");
    return;
  }
  await fs.symlink(target, linkPath);
}
