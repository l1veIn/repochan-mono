import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import ora from "ora";
import { generate, loadConfig, listEndpoints } from "@repochan/image-gen";
import { emitResult, type OutputOptions, UsageError } from "../lib/output.js";
import { runImageConfigure, type ImageConfigureOptions } from "./image-configure.js";

export { runImageConfigure };
export type { ImageConfigureOptions };

/**
 * repochan image gen --prompt "..." [--out <path>] [--endpoint <id>] [--aspect landscape|square|portrait] [--size WxH]
 *
 * Generates an image via the configured OpenAI-compatible endpoint and writes a
 * PNG to disk (default: ./generated-<timestamp>.png). The pixel bytes come from
 * @repochan/image-gen; this command only handles arg parsing + persistence.
 */
export async function runImageGen(
  cwd: string,
  options: OutputOptions & {
    prompt?: string;
    reference?: string[];
    out?: string;
    endpoint?: string;
    aspect?: string;
    size?: string;
  },
) {
  const prompt = options.prompt;
  if (!prompt || !prompt.trim()) {
    throw new UsageError("Missing --prompt. Usage: repochan image gen --prompt 'a chibi mascot' [--out out.png] [--endpoint switchbase]");
  }
  const config = loadConfig(cwd);
  const endpoints = listEndpoints(config);
  if (endpoints.length === 0) {
    throw new UsageError(
      "No image endpoints configured.",
      "Run `repochan image configure` (OpenAI or custom base URL + key).",
    );
  }

  const aspect = options.aspect as "landscape" | "square" | "portrait" | undefined;
  const size = options.size as "1024x1024" | "1536x1024" | "1024x1536" | undefined;
  // Default output goes to ~/.cache/repochan/ — keeps the project dir clean.
  // The caller (or agent) picks up the file and feeds it to `order create-result`.
  const outFile = options.out
    ? path.resolve(cwd, options.out)
    : path.join(os.homedir(), ".cache", "repochan", `generated-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.png`);

  // Load reference images (if any) for image-to-image conditioning.
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
  // Providers rarely stream progress; set expectations so agents/humans don't
  // treat a long silent wait as a hang (typical range ~30s–several minutes).
  if (!options.json) {
    console.log(`Generating via ${endpointLabel}…`);
    console.log("This usually takes about 30–300 seconds. Please wait — not stuck.");
  }
  const spinner = ora(`Waiting for image (typically 30–300s)…`).start();
  const started = Date.now();
  const tick = setInterval(() => {
    const sec = Math.floor((Date.now() - started) / 1000);
    spinner.text = `Waiting for image… ${sec}s elapsed (typically 30–300s)`;
  }, 1000);
  try {
    const result = await generate(
      { prompt, aspectRatio: aspect, size, referenceImages },
      config,
      { endpoint: options.endpoint },
    );
    clearInterval(tick);
    if (!result.success) {
      spinner.fail();
      throw new UsageError(`Generation failed: ${result.error}`);
    }
    // Ensure the output directory exists — the model already ran (may have
    // taken minutes), failing on a missing parent dir here wastes that cost.
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, result.image!);
    const elapsed = Math.floor((Date.now() - started) / 1000);
    spinner.succeed(`Done in ${elapsed}s`);
    emitResult(options, `Generated ${result.image!.length} bytes → ${path.relative(cwd, outFile) || outFile} (${result.endpoint}/${result.model}, ${elapsed}s)`, {
      path: outFile,
      bytes: result.image!.length,
      endpoint: result.endpoint,
      model: result.model,
      elapsedSeconds: elapsed,
    });
  } catch (err) {
    clearInterval(tick);
    spinner.fail();
    throw err;
  }
}

/** repochan image edit slice <img> --rows --cols [--out <dir>] */
export async function runImageEditSlice(
  cwd: string,
  imagePath: string | undefined,
  options: OutputOptions & { rows?: number; cols?: number; out?: string },
) {
  if (!imagePath) throw new UsageError("Usage: repochan image edit slice <png-path> --rows <n> --cols <n>");
  const { sliceImage } = await import("@repochan/image-edit");
  const { tiles, sourceFile } = await sliceImage(path.resolve(cwd, imagePath), options.rows!, options.cols!);
  emitResult(options, `Sliced ${sourceFile} into ${tiles.rows}×${tiles.cols} (${tiles.cells.length} tiles).`, { tiles });
}

/**
 * repochan image edit bg-remove <img> [--out <path>] [--model small|medium|large] [--overwrite]
 *
 * Removes the background from a single image via ISNet ML matting and writes a
 * transparent PNG. First run downloads the model (~40MB for 'small').
 */
export async function runImageEditBgRemove(
  cwd: string,
  imagePath: string | undefined,
  options: OutputOptions & { out?: string; model?: string; overwrite?: boolean },
) {
  if (!imagePath) throw new UsageError("Usage: repochan image edit bg-remove <img-path> [--out out.png] [--model small|medium|large]");
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
    emitResult(options, `Removed background from ${result.sourceFile} (${result.width}×${result.height}) → ${result.outFile}`, {
      sourceFile: result.sourceFile,
      outFile: result.outFile,
      path: absOut,
      width: result.width,
      height: result.height,
    });
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

/**
 * repochan image edit gif-from-frames <frame1> <frame2> ... [--out <path>] [--fps <n>] [--delay <ms>] [--loop <n>] [--overwrite]
 *
 * Combines multiple frame images into one animated GIF. At least 2 frames required.
 */
export async function runImageEditGifFromFrames(
  cwd: string,
  framePaths: string[] | undefined,
  options: OutputOptions & { out?: string; fps?: number; delay?: string; loop?: number; overwrite?: boolean },
) {
  if (!framePaths || framePaths.length < 2) {
    throw new UsageError("Usage: repochan image edit gif-from-frames <f1> <f2> [...] --out out.gif [--fps 12] [--delay 100] [--loop 0]");
  }
  const absFrames = framePaths.map((f) => path.resolve(cwd, f));
  const absOut = options.out
    ? path.resolve(cwd, options.out)
    : absFrames[0].replace(/(\.[^.]+)?$/, "-anim.gif");

  // --delay may be a single ms or a comma list.
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
    emitResult(options, `Combined ${result.frameCount} frames into ${result.outFile} (${result.width}×${result.height}, ${result.delay}ms/frame, loop=${result.loop})`, {
      outFile: result.outFile,
      path: absOut,
      frameCount: result.frameCount,
      width: result.width,
      height: result.height,
      delay: result.delay,
      loop: result.loop,
    });
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

