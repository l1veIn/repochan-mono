import path from "node:path";
import type { JsonObject, PersonaReviewArtifact, PersonaReviewVerdict } from "../types.js";
import { exists, initProtocol, personaReviewPath, personaReviewVersionsDir, readPersonaReviewArtifact, requireAnalysis, requirePersona, stamp, stampForPath, withProtocolRollback, writeJson } from "../protocol/index.js";
import { validateInput } from "../validate.js";
import { PersonaReviewArtifactSchema, PersonaReviewCreateParamsSchema } from "../schemas/index.js";

export async function createPersonaReview(projectRoot: string, params: JsonObject) {
  validateInput("persona.review", PersonaReviewCreateParamsSchema, params);
  await initProtocol(projectRoot);
  await requireAnalysis(projectRoot);
  await requirePersona(projectRoot);

  const verdict = String(params.verdict ?? "") as PersonaReviewVerdict;
  const notes = typeof params.notes === "string" ? params.notes.trim() : "";
  if (!notes) throw new Error("persona.review: notes is required and must be non-empty.");

  const reviewFile = personaReviewPath(projectRoot);
  const overwrite = params.overwrite === true;

  const ts = stampForPath();
  const provenance = params.provenance ?? { tool: "repochan", action: "persona.review" };
  const data: PersonaReviewArtifact = {
    verdict,
    notes,
    ...(typeof params.reviewerRole === "string" ? { reviewerRole: params.reviewerRole } : {}),
    schemaVersion: "repochan.persona-review.v1",
    generatedAt: stamp(),
    provenance,
  };
  validateInput("persona_review.artifact", PersonaReviewArtifactSchema, data);
  await withProtocolRollback([path.dirname(reviewFile)], async () => {
    const reviewExists = await exists(reviewFile);
    if (reviewExists && !overwrite) {
      throw new Error(
        "Persona review already exists. Use protocol.read to view it (artifactPath='persona/reviews/current.json'), or pass overwrite=true to replace (the prior review will be archived).",
      );
    }
    if (reviewExists && overwrite) {
      const archivePath = path.join(personaReviewVersionsDir(projectRoot), `${ts}-previous.json`);
      await writeJson(archivePath, await readPersonaReviewArtifact(projectRoot), false);
    }
    await writeJson(reviewFile, data, reviewExists ? overwrite : false);
  });

  return { review: data };
}
