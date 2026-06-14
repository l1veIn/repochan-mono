import { fileURLToPath } from "node:url";
import path from "node:path";

// Keep this file in sync with resources.ts/resources.d.ts. The CLI imports this
// through standard Node ESM because the package build currently uses noEmit.

export function getRepoChanPiResources() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return {
    extensionPath: path.join(dir, "extensions", "repochan.ts"),
    skillsPath: path.join(dir, "skills"),
  };
}
