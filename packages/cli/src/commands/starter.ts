import path from "node:path";
import { emitResult, dim, type OutputOptions, UsageError } from "../lib/output.js";
import { listStarters, getStarterDir, getDefaultStarterId, type StarterMeta } from "../lib/starter-loader.js";

// ---------------------------------------------------------------------------
// starter list — list available landing-page starters (with optional --tag filter)
// ---------------------------------------------------------------------------
export async function runStarterList(cwd: string, options: OutputOptions & { tag?: string }) {
  const all = await listStarters();
  const starters = options.tag
    ? all.filter((s) => s.tags?.includes(options.tag!))
    : all;

  const lines = starters.map((s) => {
    const tags = s.tags?.length ? ` [${s.tags.join(", ")}]` : "";
    const dft = s.default ? " (default)" : "";
    return `  ${s.id}  ${dim("—")} ${s.name ?? s.id}${dft}${tags}`;
  });
  const suffix = options.tag ? ` tagged '${options.tag}'` : "";
  const human = `Starters${suffix} (${starters.length}):${lines.length ? `\n${lines.join("\n")}` : ""}`;
  emitResult(options, human, { starters });
}

// ---------------------------------------------------------------------------
// starter get — show full starter.json manifest
// ---------------------------------------------------------------------------
export async function runStarterGet(cwd: string, id: string | undefined, options: OutputOptions) {
  if (!id) {
    throw new UsageError(
      "starter get requires a starter id.",
      "Usage: repochan starter get <id>   (e.g. repochan starter get minimal)",
    );
  }
  const all = await listStarters();
  const found = all.find((s) => s.id === id);
  if (!found) {
    const available = all.map((s) => s.id).join(", ");
    throw new UsageError(
      `No starter matching '${id}'.`,
      `Available: ${available}`,
    );
  }

  const human = formatStarterHuman(found);
  emitResult(options, human, found);
}

function formatStarterHuman(s: StarterMeta): string {
  const lines: string[] = [
    `${s.id} — ${s.name ?? s.id}${s.default ? " (default)" : ""}`,
    `  style: ${s.style ?? "?"}`,
    `  tags: ${s.tags?.join(", ") ?? "(none)"}`,
    `  assets (${s.assets?.length ?? 0}):`,
  ];
  for (const a of s.assets ?? []) {
    const ops = a.postprocess?.map((p) => p.op).join("+") ?? "(no postprocess)";
    const hasOrder = a.order ? " [order]" : "";
    lines.push(`    ${a.slot} → ${ops}${hasOrder}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// starter pull — scaffold a starter into .repochan/web-starter/
// ---------------------------------------------------------------------------
export async function runStarterPull(
  cwd: string,
  options: OutputOptions & { outputDir?: string; starter?: string; overwrite?: boolean },
) {
  const { promises: fs } = await import("node:fs");
  const outputDir = options.outputDir ? path.resolve(cwd, options.outputDir) : path.join(cwd, ".repochan", "web-starter");

  const starterId = options.starter ?? (await getDefaultStarterId());
  const starterDir = await getStarterDir(starterId);

  if (path.resolve(outputDir) === path.resolve(starterDir)) {
    return void emitResult(options, `Starter already present at ${outputDir}.`, {
      outputDir,
      starterDir,
      starter: starterId,
      generated: false,
    });
  }
  const { exists } = await import("@repochan/core");
  if ((await exists(outputDir)) && !options.overwrite) {
    throw new UsageError(`outputDir exists: ${outputDir}. Pass --overwrite to replace.`);
  }
  if (options.overwrite) await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(outputDir), { recursive: true });
  await fs.cp(starterDir, outputDir, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(starterDir, src);
      if (!rel) return true;
      return !rel.split(path.sep).some((part) => ["node_modules", "dist", ".astro", "starter.json"].includes(part));
    },
  });
  emitResult(options, `Scaffolded ${starterId} starter → ${outputDir}`, {
    outputDir,
    starterDir,
    starter: starterId,
    generated: true,
  });
}
