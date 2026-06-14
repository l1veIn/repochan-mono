import { fileURLToPath } from "node:url";
import path from "node:path";

// Keep this TypeScript source and the sibling resources.js/resources.d.ts files in sync.
// repochan-pi still type-checks with noEmit while Pi loads package TypeScript via jiti,
// but the standalone CLI imports repochan-pi/resources through standard Node ESM.

export function getRepoChanPiResources() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return {
    extensionPath: path.join(dir, "extensions", "repochan.ts"),
    skillsPath: path.join(dir, "skills"),
  };
}
