export function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 80) + (JSON.stringify(value).length > 80 ? "…" : "");
  } catch {
    return String(value);
  }
}
