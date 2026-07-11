/**
 * Classic OpenAI Images API mode (default).
 * - No X-Async-Mode headers
 * - POST /images/generations or /images/edits
 * - Accept url | b64
 * - Opportunistic poll if response has task/job id without image
 */

import type { ModeContext, SubmitOutcome } from "./shared.js";
import { postEdits, postGenerations } from "./shared.js";

export async function generateOpenAI(ctx: ModeContext): Promise<SubmitOutcome> {
  if (ctx.params.referenceImages?.length) {
    return postEdits(ctx);
  }
  return postGenerations(ctx);
}
