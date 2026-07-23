import { promises as fs } from "node:fs";
import path from "node:path";
import {
  appendOrderDerivedEntry,
  type OrderDerivedArtifact,
  type OrderDerivedStep,
} from "@repochan/core";

/**
 * Shared derived-artifact archive binding (audit bypass).
 *
 * Both `starter asset-apply` and `order extract` copy postprocess artifacts
 * into `.repochan/orders/<orderId>/derived/<appliedAt>--<label>/` and append
 * one entry to the order's derived.json (`repochan.order-derived.v1`) via
 * core's appendOrderDerivedEntry. This is the sanctioned exception to
 * "derived assets never flow back into .repochan/": the copies are an audit
 * trail. They never touch the immutable `versions/` directory.
 *
 * The protocol write (derived.json append, schema validation, atomic write)
 * stays in @repochan/core; this module only resolves which files to copy and
 * binds the apply/extract context into the entry's slot/starter fields.
 */

export type OrderDerivedCopy = {
  /** Declared output path recorded on the artifact (forward-slash relative), or `<out>/<file>` for directory outputs. */
  out: string;
  /** Base directory `out` resolves against when copying from. */
  sourceBase: string;
};

export type OrderDerivedArchiveStep = {
  op: OrderDerivedStep["op"];
  args?: Record<string, unknown>;
  out: string;
  keep?: boolean;
  /** Artifact copies for this step; empty when the step archived nothing (e.g. keep === false). */
  copies?: OrderDerivedCopy[];
};

async function listFilesRecursive(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...await listFilesRecursive(absolute));
    else if (entry.isFile()) found.push(absolute);
  }
  return found.sort();
}

/** Resolve `relativePath` inside `base`, refusing escapes. */
function resolveContained(base: string, relativePath: string): string {
  const resolved = path.resolve(base, relativePath);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error(`Derived archive source escapes its base: ${relativePath}`);
  }
  return resolved;
}

/**
 * Copy one step output (single file or directory tree) into the order's
 * derived archive. Directory outputs are archived recursively with one
 * artifact record per file.
 */
async function archiveStepOutput(
  orderRoot: string,
  archiveDir: string,
  sourceBase: string,
  out: string,
): Promise<OrderDerivedArtifact[]> {
  const source = resolveContained(sourceBase, out);
  const stat = await fs.stat(source).catch(() => undefined);
  if (!stat) throw new Error(`Derived archive source is missing: ${out}`);
  const files = stat.isDirectory() ? await listFilesRecursive(source) : [source];
  const artifacts: OrderDerivedArtifact[] = [];
  for (const file of files) {
    const artifactOut = stat.isDirectory() ? `${out}/${path.relative(source, file).split(path.sep).join("/")}` : out;
    const stored = `${archiveDir}/${artifactOut}`;
    const destination = path.join(orderRoot, ...stored.split("/"));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(file, destination);
    artifacts.push({ out: artifactOut, stored });
  }
  return artifacts;
}

/**
 * Archive one derived-artifact run into the order's derived/ audit copy and
 * append derived.json. Returns the archive dir (order-relative, `derived/…`).
 * Throws on failure — callers decide whether archiving is best-effort
 * (`starter asset-apply`, which warns) or fatal (`order extract`, whose
 * primary purpose is the archive).
 */
export async function archiveOrderDerivedRun(input: {
  cwd: string;
  orderId: string;
  /** derived.json entry field (schema requires a non-empty string). */
  slot: string;
  /** derived.json entry field (schema requires a non-empty string). */
  starter: string;
  resultVersion: string;
  /** Archive directory label: `derived/<appliedAt>--<archiveLabel>`. */
  archiveLabel: string;
  steps: OrderDerivedArchiveStep[];
}): Promise<string> {
  const appliedAt = new Date().toISOString();
  const archiveDir = `derived/${appliedAt.replace(/[:.]/g, "-")}--${input.archiveLabel}`;
  const orderRoot = path.join(input.cwd, ".repochan", "orders", input.orderId);
  const steps: OrderDerivedStep[] = [];
  for (const step of input.steps) {
    const artifacts: OrderDerivedArtifact[] = [];
    for (const copy of step.copies ?? []) {
      artifacts.push(...await archiveStepOutput(orderRoot, archiveDir, copy.sourceBase, copy.out));
    }
    steps.push({
      op: step.op,
      ...(step.args !== undefined ? { args: step.args } : {}),
      out: step.out,
      ...(step.keep !== undefined ? { keep: step.keep } : {}),
      artifacts,
    });
  }
  await appendOrderDerivedEntry(input.cwd, input.orderId, {
    slot: input.slot,
    starter: input.starter,
    resultVersion: input.resultVersion,
    appliedAt,
    archiveDir,
    steps,
  });
  return archiveDir;
}
