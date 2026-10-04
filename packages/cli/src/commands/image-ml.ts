import { emitResult, type OutputOptions, UsageError } from "../lib/output.js";
import {
  getImageMlCapabilityStatus,
  installImageMlCapability,
  type ImageMlCapabilityDeps,
} from "../lib/image-ml-capability.js";

export async function runImageMlStatus(
  _cwd: string,
  options: OutputOptions,
  deps: ImageMlCapabilityDeps = {},
) {
  const status = await getImageMlCapabilityStatus(deps);
  const message = status.installed
    ? `Image ML capability ready (${status.packageName}@${status.installedVersion}) at ${status.runtimeRoot}.`
    : `Image ML capability is not installed (${status.reason}). Run \`${status.installCommand}\`.`;
  return emitResult(options, message, status);
}

export async function runImageMlInstall(
  _cwd: string,
  options: OutputOptions & { force?: boolean },
  deps: ImageMlCapabilityDeps = {},
) {
  let result: Awaited<ReturnType<typeof installImageMlCapability>>;
  try {
    result = await installImageMlCapability(options, deps);
  } catch (error) {
    const failure = new UsageError(
      error instanceof Error ? error.message : String(error),
      "Check any reported recovery path, capability status, npm registry access, and free disk space before retrying.",
    );
    failure.cause = error;
    throw failure;
  }
  const message = result.updated
    ? `Installed image ML capability ${result.packageName}@${result.requiredVersion} → ${result.runtimeRoot}. ML operations are now fully offline.`
    : `Image ML capability already installed at ${result.runtimeRoot}.`;
  return emitResult(options, message, result);
}
