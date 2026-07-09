import { emitResult, type OutputOptions } from "../lib/output.js";

// repochan template list — list built-in templates (Phase 3 will wire search/pull
// against an online template registry).
export async function runTemplateList(cwd: string, _options: OutputOptions) {
  // For now, the only template is the dogfood repochan-page Astro project.
  emitResult(_options, "Templates (Phase 3 — list/search/pull against online registry coming soon):\n  - repochan-page (local Astro dogfood site)", {
    templates: [{ id: "repochan-page", status: "local" }],
  });
}
