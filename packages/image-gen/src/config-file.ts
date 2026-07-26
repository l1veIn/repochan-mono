import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

/** Publish one config file without exposing partial bytes or permissive modes. */
export function writeConfigFileAtomic(path: string, contents: string): void {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });

  const temporaryPath = join(directory, `.${basename(path)}.${randomUUID()}.tmp`);
  let fileDescriptor: number | undefined;

  try {
    fileDescriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(fileDescriptor, contents, "utf8");
    fsyncSync(fileDescriptor);
    closeSync(fileDescriptor);
    fileDescriptor = undefined;

    renameSync(temporaryPath, path);

    // Windows cannot fsync directory handles (EPERM). The file itself is
    // already durable and atomically renamed; retain the stronger directory
    // durability barrier on platforms that support it.
    if (process.platform !== "win32") {
      const directoryDescriptor = openSync(directory, "r");
      try {
        fsyncSync(directoryDescriptor);
      } finally {
        closeSync(directoryDescriptor);
      }
    }
  } catch (error) {
    if (fileDescriptor !== undefined) {
      try {
        closeSync(fileDescriptor);
      } catch {
        // Preserve the publishing error; cleanup continues below.
      }
    }
    try {
      unlinkSync(temporaryPath);
    } catch (cleanupError) {
      if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new AggregateError([error, cleanupError], `Failed to publish image config at ${path} and clean its temporary file.`);
      }
    }
    throw error;
  }
}
