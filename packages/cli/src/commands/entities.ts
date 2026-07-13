import path from "node:path";
import {
  root,
  exists,
  readJson,
  writeJson,
  safeProtocolPath,
  findFoundationSheet,
  createReview,
} from "@repochan/core";
import { emitResult, type OutputOptions, UsageError } from "../lib/output.js";
import { readDataFile } from "../lib/data-file.js";

// ---------------------------------------------------------------------------
// foundation find — locate the foundation sheet (visual anchor) order
// ---------------------------------------------------------------------------
export async function runFoundationFind(cwd: string, options: OutputOptions) {
  const result = await findFoundationSheet(cwd);
  emitResult(options, result ? `Foundation sheet found: ${result.orderId}` : "No foundation sheet found.", result);
}

// ---------------------------------------------------------------------------
// page generate-project — scaffold a starter into .repochan/web-starter/
// ---------------------------------------------------------------------------
export async function runPageGenerateProject(
  cwd: string,
  options: OutputOptions & { outputDir?: string; templateDir?: string; starter?: string; overwrite?: boolean },
) {
  const { promises: fs } = await import("node:fs");
  const outputDir = options.outputDir ? path.resolve(cwd, options.outputDir) : path.join(cwd, ".repochan", "web-starter");

  // Resolve the template source: explicit --template-dir wins (escape hatch for
  // local/custom dirs); otherwise resolve a starter by id from @repochan/starters.
  let templateDir: string;
  let starterId: string | undefined;
  if (options.templateDir) {
    templateDir = path.resolve(cwd, options.templateDir);
  } else {
    const { getStarterDir, getDefaultStarterId } = await import("../lib/starter-loader.js");
    starterId = options.starter ?? (await getDefaultStarterId());
    templateDir = await getStarterDir(starterId);
  }

  if (path.resolve(outputDir) === path.resolve(templateDir)) {
    return void emitResult(options, `Page project template already present at ${outputDir}.`, {
      outputDir,
      templateDir,
      starter: starterId,
      generated: false,
    });
  }
  if (!(await exists(templateDir))) throw new UsageError(`templateDir not found: ${templateDir}. Pass --template-dir or --starter.`);
  if ((await exists(outputDir)) && !options.overwrite) throw new UsageError(`outputDir exists: ${outputDir}. Pass --overwrite to replace.`);
  if (options.overwrite) await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(outputDir), { recursive: true });
  await fs.cp(templateDir, outputDir, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(templateDir, src);
      if (!rel) return true;
      return !rel.split(path.sep).some((part) => ["node_modules", "dist", ".astro", "starter.json"].includes(part));
    },
  });
  emitResult(options, `Generated editable page project at ${outputDir}`, {
    outputDir,
    templateDir,
    starter: starterId,
    generated: true,
  });
}

// ---------------------------------------------------------------------------
// review create --data-file
// ---------------------------------------------------------------------------
export async function runReviewCreate(cwd: string, dataFile: string | undefined, options: OutputOptions) {
  const params = readDataFile(dataFile);
  const result = await createReview(cwd, params);
  emitResult(options, "Created review.", result);
}

// ---------------------------------------------------------------------------
// protocol inspect / read / write
// ---------------------------------------------------------------------------
export async function runProtocolInspect(cwd: string, options: OutputOptions) {
  const { inspectProtocol } = await import("@repochan/core");
  const summary = await inspectProtocol(cwd);
  emitResult(options, JSON.stringify(summary, null, 2), summary);
}

export async function runProtocolRead(cwd: string, artifactPath: string | undefined, options: OutputOptions) {
  if (!artifactPath) throw new UsageError("Usage: repochan protocol read <artifact-path>");
  const file = safeProtocolPath(cwd, artifactPath);
  const data = await readJson(file);
  emitResult(options, JSON.stringify(data, null, 2), data);
}

export async function runProtocolWrite(cwd: string, artifactPath: string | undefined, dataFile: string | undefined, options: OutputOptions & { overwrite?: boolean }) {
  if (!artifactPath) throw new UsageError("Usage: repochan protocol write <artifact-path> --data-file -");
  const file = safeProtocolPath(cwd, artifactPath);
  const data = readDataFile(dataFile);
  await writeJson(file, data, options.overwrite === true);
  emitResult(options, `Wrote ${artifactPath}`, { artifactPath, path: path.relative(cwd, file) });
}
