import { promises as fs } from "node:fs";
import path from "node:path";

const PROTOCOL_SEGMENT = ".repochan";

/**
 * Reject protocol paths whose existing `.repochan` component or descendants
 * contain a symbolic link. Lexical containment alone is insufficient because
 * a link can redirect an otherwise-safe path outside the project.
 */
export async function assertNoProtocolSymlinkPath(target: string): Promise<void> {
  const resolved = path.resolve(target);
  const parsed = path.parse(resolved);
  const segments = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
  const protocolIndex = segments.lastIndexOf(PROTOCOL_SEGMENT);
  if (protocolIndex < 0) {
    throw new Error(`Protocol path must contain ${PROTOCOL_SEGMENT}: ${target}`);
  }

  let current = path.join(parsed.root, ...segments.slice(0, protocolIndex));
  for (const segment of segments.slice(protocolIndex)) {
    current = path.join(current, segment);
    let stat: Awaited<ReturnType<typeof fs.lstat>>;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing protocol path through symbolic link: ${current}`);
    }
  }
}
