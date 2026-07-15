import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import ora from "ora";
import {
  generate,
  loadConfig,
  listEndpoints,
  normalizeImageRequestMode,
  IMAGE_AGENT_BASH_TIMEOUT_MS,
  IMAGE_ASYNC_MAX_WAIT_MS,
  type ImageRequestMode,
} from "@repochan/image-gen";
// modeOverride: only force when user passes --mode openai|openai-async
import { emitResult, type OutputOptions, UsageError } from "../lib/output.js";
import {
  runImageConfigure,
  runImageStatus,
  runImageProbe,
  type ImageConfigureOptions,
} from "./image-configure.js";

export { runImageConfigure, runImageStatus, runImageProbe };
export type { ImageConfigureOptions };

/**
 * repochan image gen --prompt "..." [--out <path>] [--endpoint <id>] [--mode openai|openai-async]
 *   [--aspect landscape|square|portrait] [--size WxH] [--reference ...]
 */
export async function runImageGen(
  cwd: string,
  options: OutputOptions & {
    prompt?: string;
    reference?: string[];
    out?: string;
    endpoint?: string;
    mode?: string;
    aspect?: string;
    size?: string;
    quality?: string;
  },
) {
  const prompt = options.prompt;
  if (!prompt || !prompt.trim()) {
    throw new UsageError(
      "Missing --prompt. Usage: repochan image gen --prompt 'a chibi mascot' [--out out.png] [--endpoint endpointId]",
    );
  }
  const config = loadConfig(cwd);
  const endpoints = listEndpoints(config);
  if (endpoints.length === 0) {
    throw new UsageError(
      "No image endpoints configured.",
      "Run `repochan image configure` (OpenAI, custom sync, or async relay).",
    );
  }

  const aspect = options.aspect as "landscape" | "square" | "portrait" | undefined;
  const size = options.size as string | undefined;
  const quality = options.quality as "low" | "medium" | "high" | "auto" | undefined;
  const modeOverride: ImageRequestMode | undefined = options.mode
    ? normalizeImageRequestMode(options.mode)
    : undefined;

  const outFile = options.out
    ? path.resolve(cwd, options.out)
    : path.join(
        os.homedir(),
        ".cache",
        "repochan",
        `generated-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.png`,
      );

  let referenceImages: Array<{ data: Uint8Array; mimeType: string }> | undefined;
  const refRaw = options.reference;
  const refList = refRaw ? (Array.isArray(refRaw) ? refRaw : [refRaw]) : [];
  if (refList.length) {
    referenceImages = [];
    for (const refPath of refList) {
      const absRef = path.resolve(cwd, refPath);
      const ext = path.extname(absRef).toLowerCase();
      const mimeType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
      const data = await fs.readFile(absRef);
      referenceImages.push({ data: new Uint8Array(data), mimeType });
    }
    if (!options.json) {
      console.log(`Using ${referenceImages.length} reference image(s) for conditioning.`);
    }
  }

  const endpointLabel = options.endpoint ?? config.defaultEndpoint ?? endpoints[0];
  const waitHintMin = Math.round(IMAGE_ASYNC_MAX_WAIT_MS / 60_000);
  const bashHintSec = Math.round(IMAGE_AGENT_BASH_TIMEOUT_MS / 1000);

  if (!options.json) {
    console.log(`Generating via ${endpointLabel}…`);
    console.log("OpenAI-compatible auto mode: classic submit; polls if the relay returns a job id.");
    console.log("No automatic re-generation on failure. Do not start a second gen for the same order.");
    console.log(`Agent bash timeout recommendation: ≥ ${bashHintSec}s (${IMAGE_AGENT_BASH_TIMEOUT_MS} ms).`);
  }

  const spinner = ora(`Waiting for image… (may take several minutes; async poll up to ~${waitHintMin} min)`).start();
  const started = Date.now();
  const tick = setInterval(() => {
    const sec = Math.floor((Date.now() - started) / 1000);
    spinner.text = `Waiting for image… ${sec}s elapsed`;
  }, 1000);

  try {
    const result = await generate(
      { prompt, aspectRatio: aspect, size, quality, referenceImages },
      config,
      { endpoint: options.endpoint, mode: modeOverride },
    );
    clearInterval(tick);
    if (!result.success) {
      spinner.fail();
      const extra: string[] = [];
      if (result.jobId) extra.push(`jobId=${result.jobId}`);
      if (result.billedRisk) {
        extra.push(
          "Upstream may already have billed — check the relay dashboard before re-running the same prompt.",
        );
      }
      throw new UsageError(
        `Generation failed: ${result.error}`,
        extra.length ? extra.join(" ") : undefined,
      );
    }
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, result.image!);
    const elapsed = Math.floor((Date.now() - started) / 1000);
    spinner.succeed(`Done in ${elapsed}s`);
    emitResult(
      options,
      `Generated ${result.image!.length} bytes → ${path.relative(cwd, outFile) || outFile} (${result.endpoint}/${result.model}, ${result.mode}→${result.effectiveMode}, ${elapsed}s)`,
      {
        path: outFile,
        bytes: result.image!.length,
        endpoint: result.endpoint,
        model: result.model,
        mode: result.mode,
        effectiveMode: result.effectiveMode,
        modeSource: result.modeSource,
        jobId: result.jobId,
        billedRisk: result.billedRisk,
        elapsedSeconds: elapsed,
      },
    );
  } catch (err) {
    clearInterval(tick);
    spinner.fail();
    throw err;
  }
}

/** repochan image edit slice <img> --rows --cols [--out <dir>] [--padding <n>] [--name-template <tpl>] */
export async function runImageEditSlice(
  cwd: string,
  imagePath: string | undefined,
  options: OutputOptions & { rows?: number; cols?: number; out?: string; padding?: string; nameTemplate?: string; overwrite?: boolean },
) {
  if (!imagePath) throw new UsageError("Usage: repochan image edit slice <png-path> --rows <n> --cols <n> [--out <dir>] [--padding <n>]");
  const absIn = path.resolve(cwd, imagePath);
  const { sliceImage, sliceGridToFiles } = await import("@repochan/image-edit");

  // No --out: coordinate preview. Returns tile metadata as JSON and writes no files.
  if (!options.out) {
    const { tiles, sourceFile } = await sliceImage(absIn, options.rows!, options.cols!);
    emitResult(options, `Previewed ${sourceFile} as a ${tiles.rows}×${tiles.cols} grid (${tiles.cells.length} coordinate cells; no files written).`, {
      tiles,
    });
    return;
  }

  // --out <dir>: crop the grid into individual tile PNGs on disk.
  const absOut = path.resolve(cwd, options.out);
  const padding = options.padding ? parseInt(options.padding, 10) : 0;
  if (Number.isNaN(padding) || padding < 0) {
    throw new UsageError(`--padding must be a non-negative integer (got "${options.padding}")`);
  }
  const spinner = ora("Cropping tiles…").start();
  try {
    const { sourceFile, tiles } = await sliceGridToFiles(absIn, absOut, {
      rows: options.rows!,
      cols: options.cols!,
      padding,
      nameTemplate: options.nameTemplate,
      overwrite: options.overwrite,
    });
    const list = tiles.map((t) => `${t.file} (${t.width}×${t.height})`).join(", ");
    spinner.succeed(`Wrote ${tiles.length} tiles → ${path.relative(cwd, absOut) || absOut}`);
    emitResult(
      options,
      `Sliced ${sourceFile} into ${tiles.length} tiles → ${absOut}: ${list}`,
      { sourceFile, outDir: absOut, tiles, padding },
    );
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

/** repochan image edit validate-seams <img> [--threshold 0.02] [--out board.png] [--overwrite] */
export async function runImageEditValidateSeams(
  cwd: string,
  imagePath: string | undefined,
  options: OutputOptions & { threshold?: string; out?: string; overwrite?: boolean },
) {
  if (!imagePath) {
    throw new UsageError("Usage: repochan image edit validate-seams <img> [--threshold 0.02] [--out board.png] [--overwrite]");
  }
  const threshold = options.threshold === undefined ? undefined : Number(options.threshold);
  if (threshold !== undefined && (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)) {
    throw new UsageError(`--threshold must be a number from 0 to 1 (got "${options.threshold}")`);
  }
  const absIn = path.resolve(cwd, imagePath);
  const boardOutFile = options.out ? path.resolve(cwd, options.out) : undefined;
  const { validateSeamlessTile } = await import("@repochan/image-edit");
  const result = await validateSeamlessTile(absIn, { threshold, boardOutFile, overwrite: options.overwrite });
  if (!result.pass) {
    const message = `Seam validation failed: score ${result.metrics.score.toFixed(6)} exceeds threshold ${result.threshold.toFixed(6)} `
      + `(left/right mean ${result.metrics.leftRight.meanDelta.toFixed(6)}, top/bottom mean ${result.metrics.topBottom.meanDelta.toFixed(6)}).`;
    emitResult(options, message, result);
    process.exitCode = 1;
    return result;
  }
  return emitResult(options, `Seam validation passed (${result.metrics.score.toFixed(6)} <= ${result.threshold.toFixed(6)}).`, result);
}

export async function runImageEditBgRemove(
  cwd: string,
  imagePath: string | undefined,
  options: OutputOptions & { out?: string; model?: string; overwrite?: boolean },
) {
  if (!imagePath) {
    throw new UsageError(
      "Usage: repochan image edit bg-remove <img-path> [--out out.png] [--model small|medium|large]",
    );
  }
  const absIn = path.resolve(cwd, imagePath);
  const absOut = options.out
    ? path.resolve(cwd, options.out)
    : absIn.replace(/(\.[^.]+)?$/, "-nobg.png");
  const model = (options.model as "small" | "medium" | "large" | undefined) ?? "small";

  const { removeImageBackground } = await import("@repochan/image-edit");
  await fs.mkdir(path.dirname(absOut), { recursive: true });
  if (!options.json) {
    console.log("Removing background via ISNet… (first run downloads the model, ~40MB)");
  }
  const spinner = ora("Matting foreground…").start();
  try {
    const result = await removeImageBackground(absIn, absOut, { model, overwrite: options.overwrite });
    spinner.succeed(`Background removed → ${path.relative(cwd, absOut) || absOut}`);
    emitResult(
      options,
      `Removed background from ${result.sourceFile} (${result.width}×${result.height}) → ${result.outFile}`,
      {
        sourceFile: result.sourceFile,
        outFile: result.outFile,
        path: absOut,
        width: result.width,
        height: result.height,
      },
    );
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

/** repochan image edit compress <img> [--out out.webp] [--format webp|jpeg|avif|png] [--quality 80] [--max-width 2560] [--overwrite] */
export async function runImageEditCompress(
  cwd: string,
  imagePath: string | undefined,
  options: OutputOptions & { out?: string; format?: string; quality?: string; maxWidth?: string; overwrite?: boolean },
) {
  if (!imagePath) throw new UsageError("Usage: repochan image edit compress <img> [--out out.webp] [--format webp] [--quality 80] [--max-width 2560]");
  const absIn = path.resolve(cwd, imagePath);
  const format = (options.format as "webp" | "jpeg" | "avif" | "png" | undefined) ?? "webp";
  const quality = options.quality ? parseInt(options.quality, 10) : undefined;
  const maxWidth = options.maxWidth ? parseInt(options.maxWidth, 10) : undefined;
  const ext = format === "jpeg" ? ".jpg" : `.${format}`;
  const absOut = options.out
    ? path.resolve(cwd, options.out)
    : absIn.replace(/\.[^.]+$/, ext);

  const { compressImage } = await import("@repochan/image-edit");
  const spinner = ora(`Compressing to ${format}…`).start();
  try {
    const result = await compressImage(absIn, absOut, { format, quality, maxWidth, overwrite: options.overwrite });
    const origMB = (result.originalBytes / 1024 / 1024).toFixed(2);
    const compMB = (result.compressedBytes / 1024 / 1024).toFixed(2);
    spinner.succeed(
      `Compressed → ${path.relative(cwd, absOut) || absOut} (${result.width}×${result.height}, ${origMB}MB → ${compMB}MB, ${result.ratio.toFixed(1)}× smaller)`,
    );
    emitResult(
      options,
      `Compressed ${result.sourceFile} → ${result.outFile} (${result.format} q${result.quality}, ${result.width}×${result.height}, ${origMB}MB → ${compMB}MB, ${result.ratio.toFixed(1)}×)`,
      { ...result, originalMB: parseFloat(origMB), compressedMB: parseFloat(compMB) },
    );
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

/** repochan image edit chroma-key <img> [--out out.png] [--matte auto|#ff00ff] [--threshold N] [--softness N] [--spill 0.85] */
export async function runImageEditChromaKey(
  cwd: string,
  imagePath: string | undefined,
  options: OutputOptions & { out?: string; matte?: string; threshold?: string; softness?: string; spill?: string },
) {
  if (!imagePath) {
    throw new UsageError(
      "Usage: repochan image edit chroma-key <img> [--out out.png] [--matte auto|#ff00ff|magenta|green|cyan] [--threshold 28] [--softness 34] [--spill 0.85]",
    );
  }
  const absIn = path.resolve(cwd, imagePath);
  const absOut = options.out
    ? path.resolve(cwd, options.out)
    : absIn.replace(/(\.[^.]+)?$/, "-chroma.png");

  const { chromaKeyImage, parseMatteColor, matteColorToHex } = await import("@repochan/image-edit");
  const matteRaw = options.matte ? parseMatteColor(options.matte) : "auto";
  const matteColor = matteRaw === "auto" ? undefined : matteRaw;

  const threshold = options.threshold ? parseFloat(options.threshold) : undefined;
  const softness = options.softness ? parseFloat(options.softness) : undefined;
  const spill = options.spill ? parseFloat(options.spill) : undefined;

  if (threshold !== undefined && (isNaN(threshold) || threshold < 0)) {
    throw new UsageError(`--threshold must be a non-negative number (got "${options.threshold}")`);
  }

  const spinner = ora("Chroma keying…").start();
  try {
    const result = await chromaKeyImage(absIn, absOut, {
      matteColor: matteColor as any,
      threshold,
      softness,
      spillSuppression: spill,
    });
    spinner.succeed(
      `Chroma keyed → ${path.relative(cwd, absOut) || absOut} (matte: ${matteColorToHex(result.matteColor)} ${result.matteColorSource}, quality score: ${result.threshold}/${result.softness})`,
    );
    emitResult(
      options,
      `Chroma keyed ${result.sourceFile} → ${result.outFile} (matte ${matteColorToHex(result.matteColor)} ${result.matteColorSource}, threshold=${result.threshold}, softness=${result.softness}, spill=${result.spillSuppression})`,
      {
        sourceFile: result.sourceFile,
        outFile: absOut,
        matteColor: matteColorToHex(result.matteColor),
        matteColorSource: result.matteColorSource,
        threshold: result.threshold,
        softness: result.softness,
        spillSuppression: result.spillSuppression,
      },
    );
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

/** repochan image edit extract-stickers <img> --rows --cols --out <dir> [--model small|medium|large] [--overwrite] */
export async function runImageEditExtractStickers(
  cwd: string,
  imagePath: string | undefined,
  options: OutputOptions & { rows?: number; cols?: number; out?: string; model?: string; overwrite?: boolean },
) {
  if (!imagePath) throw new UsageError("Usage: repochan image edit extract-stickers <img> --rows <n> --cols <n> --out <dir>");
  if (!options.out) throw new UsageError("--out <dir> is required for extract-stickers");
  if (!options.rows || !options.cols) throw new UsageError("--rows and --cols are required");

  const absIn = path.resolve(cwd, imagePath);
  const absOut = path.resolve(cwd, options.out);
  const model = (options.model as "small" | "medium" | "large" | undefined) ?? "small";
  const { extractStickersFromImage } = await import("@repochan/image-edit");

  if (!options.json) {
    console.log("Extracting stickers via ISNet… (first run downloads the model, ~40MB)");
  }
  const spinner = ora("Matting + detecting stickers…").start();
  try {
    const result = await extractStickersFromImage(absIn, {
      rows: options.rows, cols: options.cols, model, overwrite: options.overwrite,
    }, absOut);
    const list = result.stickers.map((s) => `${s.file} (${s.width}×${s.height})`).join(", ");
    spinner.succeed(`Extracted ${result.stickers.length} stickers → ${path.relative(cwd, absOut) || absOut}`);
    emitResult(
      options,
      `Extracted ${result.stickers.length} transparent stickers from ${result.sourceFile}: ${list}`,
      { sourceFile: result.sourceFile, outDir: absOut, stickers: result.stickers, config: result.config },
    );
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

/** repochan image edit resize <img> --sizes <list> --out <dir> [--fit <mode>] [--overwrite] */
export async function runImageEditResize(
  cwd: string,
  imagePath: string | undefined,
  options: OutputOptions & { sizes?: string; out?: string; fit?: string; overwrite?: boolean },
) {
  if (!imagePath) throw new UsageError("Usage: repochan image edit resize <img> --sizes 16,32,48,180,512 --out <dir>");
  if (!options.sizes) throw new UsageError("--sizes is required (comma-separated pixel sizes, e.g. 16,32,48,180,512)");
  if (!options.out) throw new UsageError("--out <dir> is required for resize");

  const absIn = path.resolve(cwd, imagePath);
  const absOut = path.resolve(cwd, options.out);
  const sizes = options.sizes.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
  if (sizes.length === 0) throw new UsageError(`--sizes must contain at least one valid number (got "${options.sizes}")`);

  const fit = (options.fit as "cover" | "contain" | "inside" | "fill" | undefined) ?? "inside";
  const { resizeImage } = await import("@repochan/image-edit");

  const targets = sizes.map((width) => ({ width }));
  const spinner = ora(`Resizing to ${sizes.length} size(s)…`).start();
  try {
    const result = await resizeImage(absIn, absOut, { targets, overwrite: options.overwrite, fit });
    const list = result.outputs.map((o) => `${o.file} (${o.width}×${o.height})`).join(", ");
    spinner.succeed(`Resized ${result.sourceFile} → ${list}`);
    emitResult(
      options,
      `Resized ${result.sourceFile} (${result.sourceWidth}×${result.sourceHeight}) into ${result.outputs.length} files → ${absOut}`,
      { sourceFile: result.sourceFile, outDir: absOut, outputs: result.outputs },
    );
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

/** repochan image edit favicon <img> [--out out.ico] [--sizes 16,32,48,180,256] [--overwrite] */
export async function runImageEditFavicon(
  cwd: string,
  imagePath: string | undefined,
  options: OutputOptions & { out?: string; sizes?: string; overwrite?: boolean },
) {
  if (!imagePath) throw new UsageError("Usage: repochan image edit favicon <img> [--out out.ico] [--sizes 16,32,48,256]");
  const absIn = path.resolve(cwd, imagePath);
  const absOut = options.out
    ? path.resolve(cwd, options.out)
    : absIn.replace(/\.[^.]+$/, ".ico");

  const sizes = options.sizes
    ? options.sizes.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0)
    : [16, 32, 48, 180, 256];

  const { generateIco } = await import("@repochan/image-edit");
  const spinner = ora(`Generating .ico (${sizes.join(", ")}px)…`).start();
  try {
    const result = await generateIco(absIn, absOut, { sizes, overwrite: options.overwrite });
    spinner.succeed(`Favicon → ${path.relative(cwd, absOut) || absOut} (${result.sizes.length} sizes)`);
    emitResult(
      options,
      `Generated ${result.outFile} from ${result.sourceFile} with sizes ${sizes.join(", ")}`,
      { sourceFile: result.sourceFile, outFile: absOut, sizes: result.sizes },
    );
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

export async function runImageEditGifFromFrames(
  cwd: string,
  framePaths: string[] | undefined,
  options: OutputOptions & {
    out?: string;
    fps?: number;
    delay?: string;
    loop?: number;
    overwrite?: boolean;
  },
) {
  if (!framePaths || framePaths.length < 2) {
    throw new UsageError(
      "Usage: repochan image edit gif-from-frames <f1> <f2> [...] --out out.gif [--fps 12] [--delay 100] [--loop 0]",
    );
  }
  const absFrames = framePaths.map((f) => path.resolve(cwd, f));
  const absOut = options.out
    ? path.resolve(cwd, options.out)
    : absFrames[0].replace(/(\.[^.]+)?$/, "-anim.gif");

  let delay: number | number[] | undefined;
  if (options.delay) {
    const parts = options.delay.split(",").map((s) => Number(s.trim()));
    delay = parts.length === 1 ? parts[0] : parts;
  }

  const { framesToGif } = await import("@repochan/image-edit");
  await fs.mkdir(path.dirname(absOut), { recursive: true });
  const spinner = ora(`Encoding GIF from ${absFrames.length} frames…`).start();
  try {
    const result = await framesToGif(absFrames, absOut, {
      fps: options.fps,
      delay,
      loop: options.loop,
      overwrite: options.overwrite,
    });
    spinner.succeed(`Animated GIF → ${path.relative(cwd, absOut) || absOut}`);
    emitResult(
      options,
      `Combined ${result.frameCount} frames into ${result.outFile} (${result.width}×${result.height}, ${result.delay}ms/frame, loop=${result.loop})`,
      {
        outFile: result.outFile,
        path: absOut,
        frameCount: result.frameCount,
        width: result.width,
        height: result.height,
        delay: result.delay,
        loop: result.loop,
      },
    );
  } catch (err) {
    spinner.fail();
    throw err;
  }
}
