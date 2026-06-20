/**
 * Image saving utilities — decode base64 and write to disk.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SaveMode } from "./types.js";

export interface SaveConfig {
  mode: SaveMode;
  outputDir?: string;
}

export interface SaveResult {
  path: string;
}

function sanitizePathPart(value: string, fallback: string): string {
  const sanitized = value
    .split("")
    .map((ch) => (/[a-zA-Z0-9_-]/.test(ch) ? ch : "_"))
    .join("")
    .replace(/_+$/g, "");
  return sanitized || fallback;
}

/**
 * Resolve save directory based on mode.
 */
export function resolveSaveDir(
  mode: SaveMode,
  agentDir: string,
  cwd: string,
  sessionId: string,
  customDir?: string,
): string | undefined {
  const safeSession = sanitizePathPart(sessionId, "session");
  switch (mode) {
    case "project":
      return join(cwd, ".pi", "generated-images", safeSession);
    case "global":
      return join(agentDir, "generated-images", safeSession);
    case "custom": {
      if (!customDir || !customDir.trim()) {
        throw new Error("save=custom requires saveDir in config or CLI parameter.");
      }
      const base = customDir.startsWith("~")
        ? customDir.replace(/^~/, process.env.HOME ?? "")
        : customDir;
      return join(base, safeSession);
    }
    case "none":
      return undefined;
  }
}

/**
 * Save base64 image data to a file. Returns the absolute path.
 */
export async function saveImage(
  base64Data: string,
  outputFormat: string,
  outputDir: string,
  imageId: string,
): Promise<string> {
  const ext = outputFormat === "jpeg" ? "jpg" : outputFormat;
  const filename = `${sanitizePathPart(imageId, "image")}.${ext}`;
  const filePath = join(outputDir, filename);
  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, Buffer.from(base64Data, "base64"));
  return filePath;
}
