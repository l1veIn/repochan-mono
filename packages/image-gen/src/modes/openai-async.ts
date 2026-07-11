/**
 * 65535-style async OpenAI-compatible mode.
 * - X-Async-Mode: true + X-Async-Image-No-Retry: 1
 * - 202 / job_id → poll /images/async-generations/{jobId}
 * - Sync 200 + data[] still accepted (relay ignored headers)
 */

import type { ModeContext, SubmitOutcome } from "./shared.js";
import { postEdits, postGenerations } from "./shared.js";

export async function generateOpenAIAsync(ctx: ModeContext): Promise<SubmitOutcome> {
  if (ctx.params.referenceImages?.length) {
    return postEdits(ctx);
  }
  return postGenerations(ctx);
}
