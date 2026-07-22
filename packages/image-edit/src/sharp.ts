import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

/** Load the package's pinned Sharp runtime on demand. */
export async function loadSharp() {
  const entry = require.resolve("sharp");
  return import(pathToFileURL(entry).href);
}
