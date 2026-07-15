import { emitResult, dim, type OutputOptions, UsageError } from "../lib/output.js";
import { loadAllTemplates, getBuiltinTemplatesDir, type TemplateData } from "../lib/template-loader.js";

/**
 * repochan template list — list built-in + project-level templates.
 */
export async function runTemplateList(cwd: string, options: OutputOptions & { tag?: string }) {
  const builtinDir = await getBuiltinTemplatesDir();
  const all = await loadAllTemplates(builtinDir, cwd);
  const templates = options.tag
    ? all.filter((template) => template.tags?.includes(options.tag!))
    : all;

  const lines = templates.map((t) => {
    const grid = t.grid ? ` ${t.grid.rows}×${t.grid.cols}${t.grid.sliceable ? " sliceable" : ""}` : "";
    return `  ${t.id}  ${dim("—")} ${t.label} (${t.width}×${t.height}${grid})`;
  });
  const suffix = options.tag ? ` tagged '${options.tag}'` : "";
  const human = `Templates${suffix} (${templates.length}):${lines.length ? `\n${lines.join("\n")}` : ""}`;
  emitResult(options, human, { templates });
}

/**
 * repochan template get <id> — show one template's full spec.
 * Matches the canonical template id exactly.
 */
export async function runTemplateGet(cwd: string, id: string | undefined, options: OutputOptions) {
  if (!id) {
    throw new UsageError(
      "template get requires a template id.",
      "Usage: repochan template get <id>   (e.g. repochan template get official/pattern-tile)",
    );
  }
  const builtinDir = await getBuiltinTemplatesDir();
  const all = await loadAllTemplates(builtinDir, cwd);
  const found = all.find((t) => t.id === id);
  if (!found) {
    const available = all.map((t) => t.id).join(", ");
    throw new UsageError(
      `No template matching '${id}'.`,
      `Available: ${available}`,
    );
  }

  const human = formatTemplateHuman(found);
  emitResult(options, human, found);
}

function formatTemplateHuman(t: TemplateData): string {
  const lines: string[] = [];
  lines.push(`${t.id}  ${dim("—")} ${t.label}`);
  if (t.description) lines.push(`  ${t.description}`);
  lines.push("");
  lines.push(`  assetType: ${t.assetType}`);
  lines.push(`  size: ${t.size} (${t.aspectRatio})`);
  if (t.grid) lines.push(`  grid: ${t.grid.rows}×${t.grid.cols}${t.grid.sliceable ? " (sliceable)" : ""}`);
  if (t.tags?.length) lines.push(`  tags: ${t.tags.join(", ")}`);
  lines.push("  prompt_template:");
  for (const line of t.promptTemplate.trimEnd().split("\n")) lines.push(`    ${line}`);
  if (t.constraints.length) {
    lines.push("  constraints:");
    for (const c of t.constraints) lines.push(`    - ${c}`);
  }
  return lines.join("\n");
}
