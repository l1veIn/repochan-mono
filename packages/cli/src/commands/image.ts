import { promises as fs } from "node:fs";
import path from "node:path";
import ora from "ora";
import { generate, loadConfig, listEndpoints } from "@repochan/image-gen";
import { emitResult, type OutputOptions, UsageError } from "../lib/output.js";

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
      "No image endpoints configured. Edit ~/.repochan/image.json to add one:\n" +
        '  { "endpoints": { "switchbase": { "baseURL": "https://switchbase.vip/v1", "apiKey": "${SWITCHBASE_KEY}", "model": "gpt-image-2" } } }',
    );
  }

  const aspect = options.aspect as "landscape" | "square" | "portrait" | undefined;
  const size = options.size as "1024x1024" | "1536x1024" | "1024x1536" | undefined;
  const outFile = options.out
    ? path.resolve(cwd, options.out)
    : path.join(cwd, `generated-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.png`);

  const spinner = ora(`Generating via ${options.endpoint ?? config.defaultEndpoint ?? endpoints[0]}...`).start();
  try {
    const result = await generate(
      { prompt, aspectRatio: aspect, size },
      config,
      { endpoint: options.endpoint },
    );
    if (!result.success) {
      spinner.fail();
      throw new UsageError(`Generation failed: ${result.error}`);
    }
    await fs.writeFile(outFile, result.image!);
    spinner.succeed();
    emitResult(options, `Generated ${result.image!.length} bytes → ${path.relative(cwd, outFile) || outFile} (${result.endpoint}/${result.model})`, {
      path: outFile,
      bytes: result.image!.length,
      endpoint: result.endpoint,
      model: result.model,
    });
  } catch (err) {
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
