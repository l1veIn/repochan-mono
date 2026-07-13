#!/usr/bin/env node
import { createRequire } from "node:module";
import { cac } from "cac";
import { printError } from "./lib/output.js";
import * as top from "./commands/toplevel.js";
import * as analysis from "./commands/analysis.js";
import * as interview from "./commands/interview.js";
import * as persona from "./commands/persona.js";
import * as order from "./commands/order.js";
import * as ent from "./commands/entities.js";
import * as setup from "./commands/setup.js";
import * as template from "./commands/template.js";
import * as image from "./commands/image.js";

// Read version from package.json at runtime so there's a single source of
// truth — bumping package.json version is enough, no hardcoded constant to sync.
const require = createRequire(import.meta.url);
const { version: VERSION } = require("../package.json") as { version: string };
const cli = cac("repochan");

// cac passes positional args unreliably to actions (variadic args collapse),
// so each grouped handler reads positionals from `cli.args` (which always holds
// the full positional list). Options arrive via the action's opts arg.

// ---- top-level (single-token commands) ----
cli.command("init", "Initialize the .repochan/ protocol directory").option("--json", "Machine-readable JSON output").action(async (opts: any) => { await top.runInit(process.cwd(), opts); });
cli.command("status", "Protocol overview").option("--json", "Machine-readable JSON output").action(async (opts: any) => { await top.runStatus(process.cwd(), opts); });
cli.command("inspect", "Raw protocol inspection").option("--json", "Machine-readable JSON output").action(async (opts: any) => { await top.runInspect(process.cwd(), opts); });
cli.command("validate", "Validate protocol artifacts").option("--json", "Machine-readable JSON output").action(async (opts: any) => { await top.runValidate(process.cwd(), opts); });

// ---- analysis ----
cli.command("analysis <sub>", "Manage the analysis report")
  .option("--json", "Machine-readable JSON output")
  .option("--overwrite", "Overwrite existing artifact")
  .option("--data-file <path>", "JSON payload from file, - for stdin, or omit when piping")
  .action(async (_p: any, opts: any) => {
    const [sub] = cli.args;
    switch (sub) {
      case "run": return await analysis.runAnalysisRun(process.cwd(), opts);
      case "get": return await analysis.runAnalysisGet(process.cwd(), opts);
      case "update": return await analysis.runAnalysisUpdate(process.cwd(), opts.dataFile, opts);
      case "enrich": return await analysis.runAnalysisEnrich(process.cwd(), opts.dataFile, opts);
      case "versions": return await analysis.runAnalysisVersions(process.cwd(), opts);
      default: throw new Error(`Unknown analysis subcommand: ${sub}. Use: run | get | update | enrich | versions`);
    }
  });

// ---- interview ----
cli.command("interview <sub>", "Manage the interview report")
  .option("--json", "Machine-readable JSON output")
  .option("--data-file <path>", "JSON payload from file, - for stdin, or omit when piping")
  .action(async (_p: any, opts: any) => {
    const [sub] = cli.args;
    switch (sub) {
      case "get": return await interview.runInterviewGet(process.cwd(), opts);
      case "create": return await interview.runInterviewCreate(process.cwd(), opts.dataFile, opts);
      case "append": return await interview.runInterviewAppend(process.cwd(), opts.dataFile, opts);
      default: throw new Error(`Unknown interview subcommand: ${sub}. Use: get | create | append`);
    }
  });

// ---- persona ----
cli.command("persona <sub>", "Manage the mascot persona")
  .option("--json", "Machine-readable JSON output")
  .option("--overwrite", "Overwrite existing persona")
  .option("--data-file <path>", "JSON payload from file, - for stdin, or omit when piping")
  .option("--slug <slug>", "Candidate slug (for persona candidate promote)")
  .action(async (_p: any, opts: any) => {
    const args = cli.args; // [sub, sub2?]
    const sub = args[0];
    const sub2 = args[1]; // for "persona candidate <create|promote>"
    switch (sub) {
      case "get": return await persona.runPersonaGet(process.cwd(), opts);
      case "create": return await persona.runPersonaCreate(process.cwd(), opts.dataFile, opts);
      case "update": return await persona.runPersonaUpdate(process.cwd(), opts.dataFile, opts);
      case "review": return await persona.runPersonaReview(process.cwd(), opts.dataFile, opts);
      case "candidate":
        if (sub2 === "create") return await persona.runPersonaCandidateCreate(process.cwd(), opts.dataFile, opts);
        if (sub2 === "promote") return await persona.runPersonaCandidatePromote(process.cwd(), opts.slug, opts);
        throw new Error(`Unknown persona candidate subcommand: ${sub2}. Use: create | promote`);
      default: throw new Error(`Unknown persona subcommand: ${sub}. Use: get | create | update | review | candidate`);
    }
  });

// ---- order ----
cli.command("order <sub>", "Manage creation orders")
  .option("--json", "Machine-readable JSON output")
  .option("--data-file <path>", "JSON payload from file, - for stdin, or omit when piping")
  .option("--text <text>", "Inline text (order add-revision)")
  .option("--rows <n>", "Grid rows", { default: undefined })
  .option("--cols <n>", "Grid cols", { default: undefined })
  .option("--model <model>", "ISNet model (extract-stickers)")
  .option("--version <v>", "Version id")
  .option("--overwrite", "Overwrite existing")
  .action(async (_p: any, opts: any) => {
    const args = cli.args; // [sub, id?, more?]
    const sub = args[0];
    const id = args[1];
    switch (sub) {
      case "list": return await order.runOrderList(process.cwd(), opts);
      case "get": return await order.runOrderGet(process.cwd(), id, opts);
      case "create": return await order.runOrderCreate(process.cwd(), opts.dataFile, opts);
      case "update": return await order.runOrderUpdate(process.cwd(), opts.dataFile, opts);
      case "set-status": return await order.runOrderSetStatus(process.cwd(), id, args[2], opts);
      case "add-revision": return await order.runOrderAddRevision(process.cwd(), id, opts.dataFile, opts.text, opts);
      case "create-result": return await order.runOrderCreateResult(process.cwd(), opts.dataFile, opts);
      case "list-results": return await order.runOrderListResults(process.cwd(), id, opts);
      case "get-result": return await order.runOrderGetResult(process.cwd(), id, opts.version, opts);
      case "resolve-references": return await order.runOrderResolveReferences(process.cwd(), id, opts);
      case "set-current": return await order.runOrderSetCurrent(process.cwd(), id, args[2], opts);
      case "candidate":
        if (id === "create") return await order.runOrderCandidateCreate(process.cwd(), opts.dataFile, opts);
        if (id === "promote") return await order.runOrderCandidatePromote(process.cwd(), args[2], args[3], opts);
        throw new Error(`Unknown order candidate subcommand: ${id}. Use: create | promote <id> <version>`);
      case "slice": return await order.runOrderSlice(process.cwd(), id, opts);
      case "extract-stickers": return await order.runOrderExtractStickers(process.cwd(), id, opts);
      default: throw new Error(`Unknown order subcommand: ${sub}. Use: list | get | create | update | set-status | add-revision | create-result | list-results | get-result | resolve-references | set-current | candidate | slice | extract-stickers`);
    }
  });

// ---- foundation ----
cli.command("foundation <sub>", "Foundation sheet (visual anchor)")
  .option("--json", "Machine-readable JSON output")
  .action(async (_p: any, opts: any) => {
    const [sub] = cli.args;
    if (sub === "find") return await ent.runFoundationFind(process.cwd(), opts);
    throw new Error(`Unknown foundation subcommand: ${sub}. Use: find`);
  });

// ---- page ----
cli.command("page <sub>", "Manage the landing page spec")
  .option("--json", "Machine-readable JSON output")
  .option("--data-file <path>", "JSON payload from file, - for stdin, or omit when piping")
  .option("--output-dir <dir>", "Output directory (generate-project)")
  .option("--template-dir <dir>", "Template directory (generate-project, overrides --starter)")
  .option("--starter <id>", "Starter id (generate-project, default: constructivist)")
  .option("--overwrite", "Overwrite existing")
  .action(async (_p: any, opts: any) => {
    const [sub] = cli.args;
    switch (sub) {
      case "get": return await ent.runPageGet(process.cwd(), opts);
      case "create": return await ent.runPageCreate(process.cwd(), opts.dataFile, opts);
      case "check-assets": return await ent.runPageCheckAssets(process.cwd(), opts);
      case "generate-project": return await ent.runPageGenerateProject(process.cwd(), opts);
      default: throw new Error(`Unknown page subcommand: ${sub}. Use: get | create | check-assets | generate-project`);
    }
  });

// ---- review ----
cli.command("review <sub>", "Create a review")
  .option("--json", "Machine-readable JSON output")
  .option("--data-file <path>", "JSON payload from file, - for stdin, or omit when piping")
  .action(async (_p: any, opts: any) => {
    const [sub] = cli.args;
    if (sub === "create") return await ent.runReviewCreate(process.cwd(), opts.dataFile, opts);
    throw new Error(`Unknown review subcommand: ${sub}. Use: create`);
  });

// ---- protocol ----
cli.command("protocol <sub>", "Protocol-level operations")
  .option("--json", "Machine-readable JSON output")
  .option("--overwrite", "Overwrite existing")
  .option("--data-file <path>", "JSON payload from file, - for stdin, or omit when piping")
  .action(async (_p: any, opts: any) => {
    const args = cli.args; // [sub, artifactPath?]
    const sub = args[0];
    const artifactPath = args[1];
    switch (sub) {
      case "inspect": return await ent.runProtocolInspect(process.cwd(), opts);
      case "read": return await ent.runProtocolRead(process.cwd(), artifactPath, opts);
      case "write": return await ent.runProtocolWrite(process.cwd(), artifactPath, opts.dataFile, opts);
      default: throw new Error(`Unknown protocol subcommand: ${sub}. Use: inspect | read | write`);
    }
  });

// ---- template ----
cli.command("template <sub>", "Asset templates")
  .option("--json", "Machine-readable JSON output")
  .option("--tag <tag>", "Filter template list by tag")
  .action(async (_p: any, opts: any) => {
    const args = cli.args; // [sub, id?]
    const sub = args[0];
    switch (sub) {
      case "list": return await template.runTemplateList(process.cwd(), opts);
      case "get": return await template.runTemplateGet(process.cwd(), args[1], opts);
      default: throw new Error(`Unknown template subcommand: ${sub}. Use: list | get`);
    }
  });

// ---- image ----
// `image <sub> [args...]` — gen / configure / status / probe → @repochan/image-gen; edit → @repochan/image-edit.
cli.command("image <sub>", "Image generation, configure, status, probe, and editing")
  .option("--json", "Machine-readable JSON output")
  .option("--prompt <text>", "Prompt (image gen)")
  .option("--reference <path>", "Reference image(s) for image-to-image (image gen, repeatable)")
  .option("--out <path>", "Output path (gen/bg-remove/gif) or dir (edit slice)")
  .option("--endpoint <id>", "Endpoint id (gen/probe/configure), overrides config default")
  .option("--endpoint-id <id>", "Name for new endpoint (image configure)")
  .option("--mode <mode>", "auto | openai | openai-async (advanced; default auto)")
  .option("--aspect <ratio>", "landscape | square | portrait (image gen)")
  .option("--size <size>", "Output dimensions: 1024x1024 | 1536x1024 | 1024x1536 | 2K | 4K | WxH (image gen)")
  .option("--quality <q>", "Rendering quality: low | medium | high | auto (image gen)")
  .option("--rows <n>", "Grid rows (image edit slice)", { default: undefined })
  .option("--cols <n>", "Grid cols (image edit slice)", { default: undefined })
  .option("--padding <n>", "Pixels to inset each tile before cropping, to dodge gutters/borders (image edit slice)", { default: undefined })
  .option("--name-template <tpl>", 'Output filename template; {i} = 0-based index, e.g. "tile-{i}.png" (image edit slice)')
  .option("--sizes <list>", "Comma-separated pixel sizes for resize/favicon, e.g. 16,32,48,180,512 (image edit resize/favicon)")
  .option("--fit <mode>", "Resize fit mode: inside | cover | contain | fill (image edit resize)", { default: undefined })
  .option("--matte <color>", "Matte color for chroma keying: auto | #ff00ff | magenta | green | cyan | white | black (image edit chroma-key)")
  .option("--threshold <n>", "Chroma key distance threshold in RGB units, default 28 (image edit chroma-key)")
  .option("--softness <n>", "Chroma key soft transition band, default 34 (image edit chroma-key)")
  .option("--spill <n>", "Chroma key edge spill suppression 0-1, default 0.85 (image edit chroma-key)")
  .option("--format <fmt>", "Output format: webp | jpeg | avif | png (image edit compress)")
  .option("--max-width <n>", "Max output width in pixels, downscales if larger (image edit compress)")
  .option("--provider <p>", "openai | custom | skip (image configure)")
  .option("--api-key <key>", "API key (image configure)")
  .option("--base-url <url>", "Custom OpenAI-compatible base URL (image configure)")
  .option("--model <model>", "Model id (image configure) or ISNet model small|medium|large (bg-remove)")
  .option("--set-default", "Set this endpoint as default (image configure)")
  .option("--probe", "After configure, GET /models smoke check (no bill)")
  .option("--fps <n>", "Frames per second (image edit gif-from-frames)", { default: undefined })
  .option("--delay <ms>", "Per-frame delay in ms, single or comma-list (image edit gif-from-frames)")
  .option("--loop <n>", "Loop count, 0 = infinite (image edit gif-from-frames)", { default: undefined })
  .option("--overwrite", "Overwrite existing output (bg-remove / gif-from-frames)")
  .action(async (_p: any, opts: any) => {
    const args = cli.args; // [sub, imagePath?]
    const sub = args[0];
    switch (sub) {
      case "gen": return await image.runImageGen(process.cwd(), opts);
      case "status": return await image.runImageStatus(process.cwd(), opts);
      case "probe": return await image.runImageProbe(process.cwd(), opts);
      case "configure":
        return await image.runImageConfigure(process.cwd(), {
          json: opts.json,
          provider: opts.provider,
          apiKey: opts.apiKey,
          baseUrl: opts.baseUrl,
          model: opts.model,
          endpointId: opts.endpointId,
          mode: opts.mode,
          setDefault: opts.setDefault,
          probe: opts.probe,
        });
      case "edit": {
        const editSub = args[1];
        if (editSub === "slice") return await image.runImageEditSlice(process.cwd(), args[2], opts);
        if (editSub === "bg-remove") return await image.runImageEditBgRemove(process.cwd(), args[2], opts);
        if (editSub === "chroma-key") return await image.runImageEditChromaKey(process.cwd(), args[2], opts);
        if (editSub === "extract-stickers") return await image.runImageEditExtractStickers(process.cwd(), args[2], opts);
        if (editSub === "resize") return await image.runImageEditResize(process.cwd(), args[2], opts);
        if (editSub === "favicon") return await image.runImageEditFavicon(process.cwd(), args[2], opts);
        if (editSub === "compress") return await image.runImageEditCompress(process.cwd(), args[2], opts);
        if (editSub === "gif-from-frames") return await image.runImageEditGifFromFrames(process.cwd(), args.slice(2), opts);
        throw new Error(`Unknown image edit subcommand: ${editSub}. Use: slice | bg-remove | chroma-key | extract-stickers | resize | favicon | compress | gif-from-frames`);
      }
      default: throw new Error(`Unknown image subcommand: ${sub}. Use: gen | configure | status | probe | edit`);
    }
  });

// ---- setup ----
cli.command("setup", "Install skills for your agent(s) + inject a reference")
  .option("--json", "Machine-readable JSON output")
  .option("--agent <agents>", "Agent id(s): claude,codex,... | auto (one primary) | all")
  .option("--yes", "Non-interactive: one primary detected agent (install) or all configured (remove)")
  .option("--list", "Show detected / configured agents")
  .option("--remove", "Remove RepoChan setup (use with --agent or --yes)")
  .option("--global", "Install skills to ~/<agent>/skills (all projects)")
  .option("--project", "Install skills to <project>/<agent>/skills only")
  .action(async (opts: any) => { await setup.runSetup(process.cwd(), opts); });

// ---- parse ----
cli.help();
cli.version(VERSION);

function isHelpOrVersionFlag(arg: string): boolean {
  return arg === "-h" || arg === "--help" || arg === "-v" || arg === "--version";
}

/**
 * cac treats a bare `-` after `--option` as "value missing" (looks like a flag).
 * Rewrite `--data-file -` → `--data-file=-` so stdin shorthand works.
 */
function normalizeArgv(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--data-file" && argv[i + 1] === "-") {
      out.push("--data-file=-");
      i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

async function main() {
  try {
    const rawArgs = process.argv.slice(2);
    const args = normalizeArgv(rawArgs);
    const argv = [process.argv[0], process.argv[1], ...args];

    // Always let cac handle --help / --version (and their short forms).
    // Previously these were filtered out as "flags", leaving 0 positionals,
    // which incorrectly fell through to the default `status` branch.
    if (args.some(isHelpOrVersionFlag)) {
      cli.parse(argv);
      return;
    }
    const noFlags = args.filter((a) => !a.startsWith("-"));
    // Bare `repochan` (or only output flags like --json) → status overview.
    if (noFlags.length === 0) {
      await top.runStatus(process.cwd(), { json: args.includes("--json") });
      return;
    }
    // run: false so we can await async command actions (otherwise UsageError
    // from setup/etc becomes an unhandled rejection after main() returns).
    cli.parse(argv, { run: false });
    await cli.runMatchedCommand();
  } catch (err) {
    printError(err);
    process.exit(1);
  }
}

main();
