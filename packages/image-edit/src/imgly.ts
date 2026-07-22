import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { loadSharp } from "./sharp.js";

// ---------------------------------------------------------------------------
// Optional image-ML capability resolution — shared by stickers.ts/bg-remove.ts
// ---------------------------------------------------------------------------
export const IMAGE_ML_PACKAGE_NAME = "@imgly/background-removal-node";
export const IMAGE_ML_REQUIRED_VERSION = "1.4.5";

const require = createRequire(import.meta.url);

type ResolveOptions = { paths?: string[] };
type ModuleResolver = (specifier: string, options?: ResolveOptions) => string;

export type ImageMlResolutionOptions = {
  /** Test seam; production callers should leave this unset. */
  resolve?: ModuleResolver;
  /** Install prefix containing node_modules. Defaults to REPOCHAN_IMAGE_ML_ROOT. */
  root?: string;
};

export class MissingImageMlCapabilityError extends Error {
  readonly code = "REPOCHAN_IMAGE_ML_MISSING";
  readonly capability = "image-ml";
  readonly packageName = IMAGE_ML_PACKAGE_NAME;
  readonly requiredVersion = IMAGE_ML_REQUIRED_VERSION;

  constructor(options: ErrorOptions = {}) {
    super(
      `Optional image ML capability is not installed: ${IMAGE_ML_PACKAGE_NAME}@${IMAGE_ML_REQUIRED_VERSION}`,
      options,
    );
    this.name = "MissingImageMlCapabilityError";
  }
}

/**
 * Resolve the optional ML package. Normal Node resolution supports library
 * consumers that install the optional runtime package themselves. The explicit prefix is
 * for a CLI-managed, user-level capability install; this library never knows
 * where that prefix lives and never performs network or filesystem writes.
 */
export function resolveImageMlEntry(options: ImageMlResolutionOptions = {}): string {
  const resolve = options.resolve ?? require.resolve.bind(require);
  let directError: unknown;

  try {
    return resolve(IMAGE_ML_PACKAGE_NAME);
  } catch (error) {
    directError = error;
  }

  const root = options.root ?? process.env.REPOCHAN_IMAGE_ML_ROOT;
  if (root) {
    try {
      return resolve(IMAGE_ML_PACKAGE_NAME, { paths: [path.resolve(root)] });
    } catch {
      // Fall through to one stable, machine-readable error below.
    }
  }

  throw new MissingImageMlCapabilityError({ cause: directError });
}

type RemoveBackground = (
  image: Blob,
  options: { publicPath: string; model: MatteModel },
) => Promise<Blob>;

type ImageMlModule = {
  removeBackground?: RemoveBackground;
  default?: { removeBackground?: RemoveBackground };
};

type ImageMlLoaderOptions = ImageMlResolutionOptions & {
  /** Test seam; production callers should leave this unset. */
  importModule?: (specifier: string) => Promise<ImageMlModule>;
};

export async function loadImageMlCapability(
  options: ImageMlLoaderOptions = {},
): Promise<{ removeBackground: RemoveBackground; publicPath: string }> {
  const entry = resolveImageMlEntry(options);
  const importModule = options.importModule ?? ((specifier: string) => import(specifier) as Promise<ImageMlModule>);
  const loaded = await importModule(pathToFileURL(entry).href);
  const removeBackground = loaded.removeBackground ?? loaded.default?.removeBackground;
  if (typeof removeBackground !== "function") {
    throw new TypeError(`${IMAGE_ML_PACKAGE_NAME} does not export removeBackground()`);
  }

  // @imgly locates resources.json and model files relative to publicPath. The
  // trailing slash is required so relative URLs stay inside dist/.
  const publicPath = pathToFileURL(`${path.dirname(entry)}${path.sep}`).href;
  return { removeBackground, publicPath };
}

/** ISNet model sizes actually bundled by @imgly/background-removal-node@1.4.5. */
export type MatteModel = "small" | "medium";

function assertMatteModel(model: unknown): asserts model is MatteModel {
  if (model !== "small" && model !== "medium") {
    throw new RangeError(`matteImage: model must be small | medium (got "${String(model)}").`);
  }
}

/**
 * Run ML matting (ISNet via @imgly) on a source image buffer and return the
 * foreground (transparent-background) pixels as raw RGBA, plus dimensions.
 *
 * Shared by `extractStickersFromImage` (sticker blob detection) and
 * `removeImageBackground` (standalone bg-remove). Keeps the matting step in
 * one place so both callers stay consistent.
 *
 * @param srcBuf    source image bytes (PNG/JSBuffer)
 * @param mimeType  MIME type for the imgly Blob (default image/png)
 * @param model     ISNet model size (default 'small')
 */
export async function matteImage(
  srcBuf: Buffer,
  mimeType = "image/png",
  model: MatteModel = "small",
): Promise<{ data: Buffer; width: number; height: number; channels: number }> {
  assertMatteModel(model);
  const { removeBackground, publicPath } = await loadImageMlCapability();
  const mattedBlob = await removeBackground(new Blob([new Uint8Array(srcBuf)], { type: mimeType }), {
    publicPath,
    model,
  });
  const mattedBuf = Buffer.from(await mattedBlob.arrayBuffer());

  const sharp = (await loadSharp()).default;
  const raw = await sharp(mattedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: raw.data, width: raw.info.width, height: raw.info.height, channels: raw.info.channels };
}
