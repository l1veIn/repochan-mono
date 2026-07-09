import { promises as fs } from "node:fs";
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
  const outFile = options.out
    ? path.resolve(cwd, options.out)
    : path.join(cwd, `generated-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.png`);

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
      { prompt, aspectRatio: aspect, size },
      config,
      { endpoint: options.endpoint },
    );
    clearInterval(tick);
    if (!result.success) {
      spinner.fail();
      throw new UsageError(`Generation failed: ${result.error}`);
    }
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
