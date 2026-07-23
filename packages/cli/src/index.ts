#!/usr/bin/env node
import { createRequire } from "node:module";
import { cac } from "cac";
import { printError, UsageError, ApplyFailurePrintedError } from "./lib/output.js";
import { cliVersion } from "./lib/register.js";
import { isTopLevelHelpOrVersionRequest, normalizeCliArgv } from "./lib/argv.js";
import * as top from "./commands/toplevel.js";
import * as analysis from "./commands/analysis.js";
import * as interview from "./commands/interview.js";
import * as persona from "./commands/persona.js";
import * as order from "./commands/order.js";
import * as ent from "./commands/entities.js";
import * as setup from "./commands/setup.js";
import * as template from "./commands/template.js";
import * as starter from "./commands/starter.js";
import * as starterSync from "./commands/starter-sync.js";
import * as starterPreview from "./commands/starter-preview.js";
import * as image from "./commands/image.js";
import * as imageMl from "./commands/image-ml.js";
import * as dev from "./commands/dev.js";
import * as browse from "./commands/browse.js";
import { recordError, hasRecorded } from "./lib/dev-telemetry.js";

// Version: semver from package.json + git hash suffix (shared with register.ts
// so .repochan-version and --version always agree).
const VERSION = cliVersion();
const cli = cac("repochan");

// Capture unknown top-level commands (e.g. `repochan foobar`) for dev telemetry.
// cac emits `command:*` when no command matches and there is at least one
// positional arg. We only record — we deliberately do NOT change the exit code
// or print anything, preserving the current silent exit-0 behaviour.
// Registered before parse() so the event is observed during cli.parse().
cli.on("command:*", () => {
  recordError({ argv: process.argv.slice(2), category: "unknown-command", exitCode: 0 });
});

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
  .option("--full", "Output the complete analysis JSON without summarization (analysis get only)")
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
  .option("--result-version <v>", "Result version id (get-result / extract; default: currentVersion)")
  .option("--rows <n>", "Grid rows (order extract; default: order template grid)")
  .option("--cols <n>", "Grid cols (order extract; default: order template grid)")
  .option("--strategy <s>", "Extract strategy: chroma-grid (default) | equal-cell | ml-blobs | hybrid (order extract)")
  .option("--pipeline <v>", "Chroma pipeline: v2 (default) | v1 (order extract)")
  .option("--ml-fallback", "Allow ML assist fallback; required with --strategy hybrid (order extract)")
  .option("--model <model>", "ISNet model small | medium for ML strategies (order extract)")
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
      case "get-result": {
        if (args.length > 2) throw new UsageError("Usage: repochan order get-result <id> [--result-version <version-id>]");
        return await order.runOrderGetResult(process.cwd(), id, opts.resultVersion, opts);
      }
      case "resolve-references": return await order.runOrderResolveReferences(process.cwd(), id, opts);
      case "extract": return await order.runOrderExtract(process.cwd(), id, opts);
      case "recovery":
        if (id === "list") return await order.runOrderRecoveryList(process.cwd(), args[2], opts);
        if (id === "recover") return await order.runOrderRecoveryRecover(process.cwd(), args[2], args[3], opts);
        if (id === "abort") return await order.runOrderRecoveryAbort(process.cwd(), args[2], args[3], opts);
        throw new Error(`Unknown order recovery subcommand: ${id}. Use: list <id> | recover <id> <transaction> | abort <id> <transaction>`);
      case "candidate":
        if (id === "create") return await order.runOrderCandidateCreate(process.cwd(), opts.dataFile, opts);
        if (id === "promote") return await order.runOrderCandidatePromote(process.cwd(), args[2], args[3], opts);
        throw new Error(`Unknown order candidate subcommand: ${id}. Use: create | promote <id> <version>`);
      default: throw new Error(`Unknown order subcommand: ${sub}. Use: list | get | create | update | set-status | add-revision | create-result | list-results | get-result | resolve-references | extract | recovery | candidate`);
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

// ---- starter ----
cli.command("starter <sub>", "Landing-page starters")
  .option("--json", "Machine-readable JSON output")
  .option("--tag <tag>", "Filter starter list by tag")
  .option("--output-dir <dir>", "Starter instance directory (default: .repochan/web-starter)")
  .option("--starter <id>", "Starter id (pull; otherwise uses the sole default)")
  .option("--from <dir>", "Trusted local Starter source directory (pull)")
  .option("--overwrite", "Allow replacing an existing output or generated config")
  .option("--content-file <path>", "Locale content JSON for configure")
  .option("--repository-url <url>", "Repository URL override (configure)")
  .option("--all", "Validate every built-in starter")
  .option("--localized", "Require every required asset slot to be customized (validate)")
  .option("--foundation <order-id>", "Foundation order reference (create-order)")
  .option("--intent <text>", "Creative intent (create-order)")
  .option("--status <status>", "Initial order status (create-order, default: draft)")
  .option("--order <order-id>", "Delivered order to apply (asset-apply)")
  .option("--result-version <version-id>", "Specific delivered result version (asset-apply)")
  .option("--file <path>", "Local source file to import (asset-import)")
  .option("--force", "Re-download starters even when the cache is current (sync)")
  .option("--channel <tag>", "npm dist-tag to sync (default: latest; release staging: next)")
  .option("--port <n>", "Port to bind on 127.0.0.1 (starter preview; default: free port)")
  .option("--no-open", "Do not open the browser automatically (starter preview)")
  .option("--rebuild", "Re-run install/build even when a dist cache exists (starter preview)")
  .action(async (_p: any, opts: any) => {
    const args = cli.args;
    const sub = args[0];
    switch (sub) {
      case "list": return await starter.runStarterList(process.cwd(), opts);
      case "get": return await starter.runStarterGet(process.cwd(), args[1], opts);
      case "sync": return await starterSync.runStarterSync(process.cwd(), opts);
      case "pull": return await starter.runStarterPull(process.cwd(), opts);
      case "configure": return await starter.runStarterConfigure(process.cwd(), opts);
      case "create-order": return await starter.runStarterCreateOrder(process.cwd(), args[1], opts);
      case "asset-apply": return await starter.runStarterAssetApply(process.cwd(), args[1], opts);
      case "asset-import": return await starter.runStarterAssetImport(process.cwd(), args[1], opts);
      case "validate": return await starter.runStarterValidate(process.cwd(), args[1], opts);
      case "preview": return await starterPreview.runStarterPreview(process.cwd(), args[1], opts);
      default: throw new Error(`Unknown starter subcommand: ${sub}. Use: list | get | sync | pull | configure | create-order | asset-apply | asset-import | validate | preview`);
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
cli.command("protocol <sub>", "Inspect or read protocol state")
  .option("--json", "Machine-readable JSON output")
  .action(async (_p: any, opts: any) => {
    const args = cli.args; // [sub, artifactPath?]
    return ent.runProtocolCommand(process.cwd(), args[0], args[1], opts);
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
  .option("--matte <color>", "Matte color for chroma keying: auto | #ff00ff | magenta | green | cyan | white | black (image edit chroma-key/extract)")
  .option("--threshold <n>", "Threshold: RGB distance for chroma-key; normalized 0..1 for validate-seams")
  .option("--softness <n>", "Chroma key soft transition band, default 34 (v1 pipeline only; image edit chroma-key)")
  .option("--spill <n>", "Chroma key edge spill suppression 0-1, default 0.85 (v1 pipeline only; image edit chroma-key)")
  .option("--pipeline <v>", "Chroma pipeline: v2 (default) | v1 (legacy escape hatch) (image edit chroma-key/extract)")
  .option("--strategy <s>", "Extract strategy: chroma-grid (default) | equal-cell | ml-blobs | hybrid (image edit extract)")
  .option("--mapping <keys>", "Comma-separated semantic keys in row-major order (image edit extract)")
  .option("--mapping-file <path>", "JSON semantic mapping: key array or { key: cellIndex } (image edit extract)")
  .option("--matte-select <mode>", "Matte auto-select mode: corner (default) | subject-aware (image edit extract)")
  .option("--normalize <n>", "Normalize extracted assets onto an N×N canvas (image edit extract); iconfont intermediate tile size, default 512 (image edit iconfont)")
  .option("--view-box <n>", "Iconfont SVG viewBox edge, default 24 (image edit iconfont)")
  .option("--ml-fallback", "Allow ML assist fallback; required with --strategy hybrid (image edit extract)")
  .option("--format <fmt>", "Output format: webp | jpeg | avif | png (image edit compress)")
  .option("--max-width <n>", "Max output width in pixels, downscales if larger (image edit compress)")
  .option("--provider <p>", "openai | codex | custom | skip (image configure)")
  .option("--api-key <key>", "API key (image configure)")
  .option("--base-url <url>", "Custom OpenAI-compatible base URL (image configure)")
  .option("--model <model>", "Model id (image configure) or ISNet model small|medium (ML image edit)")
  .option("--set-default", "Set this endpoint as default (image configure)")
  .option("--probe", "After configure, GET /models smoke check (no bill)")
  .option("--fps <n>", "Frames per second (image edit gif-from-frames)", { default: undefined })
  .option("--delay <ms>", "Per-frame delay in ms, single or comma-list (image edit gif-from-frames)")
  .option("--loop <n>", "Loop count, 0 = infinite (image edit gif-from-frames)", { default: undefined })
  .option("--overwrite", "Overwrite existing output (bg-remove / gif-from-frames)")
  .option("--force", "Reinstall the pinned image ML runtime (image edit ml install)")
  .action(async (_p: any, opts: any) => {
    const args = cli.args; // [sub, imagePath?]
    const sub = args[0];
    switch (sub) {
      case "gen": {
        // Backstop: if the user passed multiple paths after a single --reference
        // (e.g. --reference A B), cac swallows B into cli.args as a stray positional.
        // This silently drops the second reference image. Detect and error clearly.
        const stray = args.slice(1); // anything after "gen"
        if (stray.length > 0) {
          throw new Error(
            `Unexpected positional argument(s) after "image gen": ${stray.map(s => `"${s}"`).join(", ")}.\n` +
            `Did you pass multiple reference paths to a single --reference? ` +
            `Use separate flags: --reference <path1> --reference <path2>`,
          );
        }
        return await image.runImageGen(process.cwd(), opts);
      }
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
        if (editSub === "ml") {
          const mlSub = args[2];
          if (mlSub === "status") return await imageMl.runImageMlStatus(process.cwd(), opts);
          if (mlSub === "install") return await imageMl.runImageMlInstall(process.cwd(), opts);
          throw new Error(`Unknown image edit ml subcommand: ${mlSub}. Use: status | install`);
        }
        if (editSub === "slice") return await image.runImageEditSlice(process.cwd(), args[2], opts);
        if (editSub === "validate-seams") return await image.runImageEditValidateSeams(process.cwd(), args[2], opts);
        if (editSub === "bg-remove") return await image.runImageEditBgRemove(process.cwd(), args[2], opts);
        if (editSub === "chroma-key") return await image.runImageEditChromaKey(process.cwd(), args[2], opts);
        if (editSub === "extract") return await image.runImageEditExtract(process.cwd(), args[2], opts);
        if (editSub === "iconfont") return await image.runImageEditIconfont(process.cwd(), args[2], opts);
        if (editSub === "layout-guide") return await image.runImageEditLayoutGuide(process.cwd(), opts);
        if (editSub === "resize") return await image.runImageEditResize(process.cwd(), args[2], opts);
        if (editSub === "favicon") return await image.runImageEditFavicon(process.cwd(), args[2], opts);
        if (editSub === "compress") return await image.runImageEditCompress(process.cwd(), args[2], opts);
        if (editSub === "gif-from-frames") return await image.runImageEditGifFromFrames(process.cwd(), args.slice(2), opts);
        throw new Error(`Unknown image edit subcommand: ${editSub}. Use: ml | slice | validate-seams | bg-remove | chroma-key | extract | iconfont | layout-guide | resize | favicon | compress | gif-from-frames`);
      }
      default: throw new Error(`Unknown image subcommand: ${sub}. Use: gen | configure | status | probe | edit`);
    }
  });

// ---- browse (local protocol viewer) ----
cli.command("browse", "Open the local .repochan/ protocol viewer (read-only)")
  .option("--port <n>", "Port to bind on 127.0.0.1 (default 4173, falls back to a free port)")
  .option("--no-open", "Do not open the browser automatically")
  .option("--json", "Machine-readable JSON output")
  .action(async (opts: any) => { await browse.runBrowse(process.cwd(), opts); });

// ---- dev (local-only tooling; telemetry opt-in via REPOCHAN_DEV_TELEMETRY) ----
cli.command("dev <sub>", "Local dev tooling (telemetry / diagnostics)")
  .option("--json", "Machine-readable JSON output")
  .option("--limit <n>", "Number of recent entries to show")
  .option("--clear", "Clear the dev telemetry log")
  .option("--on", "Enable telemetry (writes ~/.repochan/dev/config.json)")
  .option("--off", "Disable telemetry")
  .action(async (_p: any, opts: any) => {
    const args = cli.args; // [sub]
    const sub = args[0];
    switch (sub) {
      case "errors": return await dev.runDevErrors(process.cwd(), {
        json: opts.json,
        limit: opts.limit ? Number(opts.limit) : undefined,
        clear: opts.clear,
        on: opts.on,
        off: opts.off,
      });
      default: throw new Error(`Unknown dev subcommand: ${sub}. Use: errors`);
    }
  });

// ---- setup ----
cli.command("setup", "Install skills for your agent(s) + inject a reference")
  .option("--json", "Machine-readable JSON output")
  .option("--agent <agents>", "Agent id(s): claude,codex,... | auto (one primary) | all")
  .option("--yes", "Non-interactive: one primary detected agent (install) or all configured (remove)")
  .option("--list", "Show detected / configured agents")
  .option("--remove", "Remove RepoChan setup (use with --agent or --yes)")
  .option("--overwrite", "Replace a conflicting RepoChan-owned instruction path")
  .option("--global", "Install skills to ~/<agent>/skills (all projects)")
  .option("--project", "Install skills to <project>/<agent>/skills only")
  .action(async (opts: any) => { await setup.runSetup(process.cwd(), opts); });

// ---- parse ----
cli.help();
cli.version(VERSION);

/**
 * cac treats a bare `-` after `--option` as "value missing" (looks like a flag).
 * Rewrite `--data-file -` → `--data-file=-` so stdin shorthand works.
 */
async function main() {
  try {
    const rawArgs = process.argv.slice(2);
    const args = normalizeCliArgv(rawArgs);
    const argv = [process.argv[0], process.argv[1], ...args];

    // Always let cac handle --help / --version (and their short forms) before
    // the bare-command status branch.
    if (isTopLevelHelpOrVersionRequest(args)) {
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
    recordError({ error: err, argv: process.argv.slice(2), exitCode: 1 });
    // asset-apply already printed its structured failure envelope (PR5
    // sentinel) — do not print a second copy. Everything else goes through
    // printError, which emits ExtractError/UsageError JSON under --json.
    if (!(err instanceof ApplyFailurePrintedError)) {
      printError(err, { json: process.argv.includes("--json") });
    }
    process.exit(1);
  }
}

// Capture non-throwing failures (e.g. `repochan validate`, image seam-validate)
// that set process.exitCode directly and bypass the catch block above. If a
// thrown error already recorded itself, skip to avoid double-counting.
process.on("exit", () => {
  if (process.exitCode && process.exitCode !== 0 && !hasRecorded()) {
    recordError({ argv: process.argv.slice(2), category: "validation", exitCode: Number(process.exitCode) });
  }
});

main();
