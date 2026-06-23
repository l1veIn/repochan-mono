import { Value } from "typebox/value";
import type { TSchema } from "typebox";

/**
 * Validation error thrown when input params fail schema validation.
 *
 * The error message is structured for agent readability — every field-level
 * error becomes one line, so multi-field failures report ALL problems at once
 * rather than failing one-at-a-time. This lets an LLM agent self-correct in a
 * single round-trip instead of N retries.
 *
 * Example message:
 *   validate createOrderResult:
 *     /orderId: Expected string
 *     /files/0: Expected string
 */
export class ValidationError extends Error {
  readonly errors: Array<{ path: string; message: string }>;

  constructor(schemaName: string, errors: Array<{ path: string; message: string }>) {
    const lines = errors.map((e) => `  /${e.path || "(root)"}: ${e.message}`);
    super(`validate ${schemaName}:\n${lines.join("\n")}`);
    this.name = "ValidationError";
    this.errors = errors;
  }
}

/**
 * Validate `value` against a TypeBox schema.
 *
 * Throws {@link ValidationError} with all field-level errors listed.
 * Use this as the first line of every write operation in core to enforce
 * a unified schema gate before any business logic runs.
 *
 * @param schemaName  Human-readable name (appears in error messages).
 * @param schema      TypeBox schema to check against.
 * @param value       Runtime value to validate.
 */
export function validateInput(schemaName: string, schema: TSchema, value: unknown): void {
  if (!Value.Check(schema, value)) {
    const errors: Array<{ path: string; message: string }> = [];
    for (const err of Value.Errors(schema, value)) {
      errors.push({ path: err.instancePath, message: err.message });
    }
    // Value.Errors can be empty on edge cases (Type.Any, union quirks).
    // Provide a fallback so a failed Check always produces a usable message.
    if (errors.length === 0) {
      errors.push({ path: "(root)", message: "Value does not match the expected schema." });
    }
    throw new ValidationError(schemaName, errors);
  }
}
