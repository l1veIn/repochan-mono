import type { ImageGenConfig } from "./types.js";

/**
 * Merge the two persisted config layers.
 *
 * A project endpoint map is an intentional replacement, not an endpoint-by-id
 * overlay. Its default therefore belongs to that replacement as well: when a
 * project file omits defaultEndpoint, the global default is cleared and the
 * first project endpoint becomes the runtime default.
 */
export function mergeConfigLayers(
  globalConfig: Partial<ImageGenConfig>,
  projectConfig: Partial<ImageGenConfig>,
): ImageGenConfig {
  const projectReplacesEndpoints = projectConfig.endpoints !== undefined;
  const endpoints = projectReplacesEndpoints
    ? projectConfig.endpoints
    : globalConfig.endpoints;

  return {
    ...globalConfig,
    ...projectConfig,
    version: 2,
    defaultEndpoint: projectReplacesEndpoints
      ? projectConfig.defaultEndpoint
      : (projectConfig.defaultEndpoint ?? globalConfig.defaultEndpoint),
    endpoints: endpoints ?? {},
  };
}
