import { closeStarterPreviews, previewStarter } from "@repochan/browse";
import { getStarter, resolveStarterSource, type ResolveStarterSourceOptions, type StarterMeta } from "../lib/starter-loader.js";
import { printJson, UsageError } from "../lib/output.js";
import { openBrowser } from "./browse.js";

export type StarterPreviewCliOptions = {
  port?: string;
  open?: boolean;
  json?: boolean;
  rebuild?: boolean;
};

/**
 * Resolve the starter for a preview run through the standard 4-level source
 * chain (--from > env > cache > bundled). `deps` is a test seam.
 */
export async function resolveStarterForPreview(id: string, deps: ResolveStarterSourceOptions = {}): Promise<StarterMeta> {
  const source = await resolveStarterSource(deps);
  if (!source) {
    throw new UsageError(
      "No starters available (no --from, REPOCHAN_STARTERS_DIR, cache, or bundled package).",
      "Run `repochan starter sync` first to download @repochan/starters.",
    );
  }
  // getStarter throws with the available id list when unknown — that message is
  // already actionable, so let it propagate.
  return getStarter(id, deps);
}

/**
 * `repochan starter preview <id>` — prepare (npm install → astro build, with a
 * dist cache) a resolved starter and serve its dist on 127.0.0.1 until Ctrl+C.
 * The heavy lifting lives in @repochan/browse so the browse SPA's
 * starter-preview action runs the exact same code path.
 */
export async function runStarterPreview(_projectRoot: string, id: string | undefined, opts: StarterPreviewCliOptions) {
  if (!id) {
    throw new UsageError("Usage: repochan starter preview <id> [--port <n>] [--no-open] [--rebuild] [--json]");
  }
  const starter = await resolveStarterForPreview(id);

  let port = 0;
  if (opts.port !== undefined) {
    const parsed = Number(opts.port);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new UsageError(`Invalid --port '${opts.port}'.`, "Use an integer between 1 and 65535.");
    }
    port = parsed;
  }

  const progress = (message: string) => {
    if (!opts.json) console.log(`  ${message}`);
  };
  if (!opts.json) console.log(`Preparing starter '${starter.id}' — ${starter.dir}`);

  const preview = await previewStarter({
    id: starter.id,
    dir: starter.dir,
    port,
    rebuild: opts.rebuild === true,
    stdio: opts.json ? "pipe" : "inherit",
    onProgress: progress,
  });

  if (opts.json) {
    printJson({ ok: true, id: starter.id, url: preview.url, port: preview.port, reused: preview.reused });
  } else {
    console.log(preview.reused ? `Serving cached build: ${preview.url}` : `Built and serving: ${preview.url}`);
    console.log("  press Ctrl+C to stop");
  }
  if (opts.open !== false) openBrowser(preview.url);

  await new Promise<void>((resolve) => {
    const shutdown = () => {
      void closeStarterPreviews().then(() => resolve());
      setTimeout(() => resolve(), 1500).unref();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
