/**
 * Host → protocol rules (Infinite-Canvas LOCKED_RECOMMENDED / detect style).
 *
 * Keep this table small and only add entries after dogfood proves a host
 * *requires* a non-default submit strategy (e.g. X-Async-Mode on every POST).
 * Do not put affiliate marketing presets here.
 *
 * Matching is by hostname (case-insensitive), with optional suffix match
 * so "api.example.com" matches rule host "example.com" only when exact or
 * full hostname equality — we use exact hostname or endsWith("." + host).
 */

import type { RuntimeImageMode } from "./types.js";

export type HostRule = {
  /** Hostname without port, e.g. "async-relay.example". */
  host: string;
  /** Runtime mode forced when baseURL host matches. */
  mode: RuntimeImageMode;
  /** Optional note for status / docs. */
  note?: string;
};

/**
 * Built-in rules. Generic OpenAI-compatible URLs stay on classic submit (no X-Async).
 * Add hosts only when dogfood proves they need a non-default submit strategy.
 *
 * Matching: exact hostname or subdomain (e.g. rule "65535.space" matches
 * "img-cn.65535.space").
 */
export const BUILTIN_HOST_RULES: readonly HostRule[] = [
  // Dogfood 2026-07: img-cn.65535.space supports both sync url and X-Async 202+job_id;
  // prefer async submit so long/complex jobs avoid sync 5‑min 504 while still billing.
  {
    host: "65535.space",
    mode: "openai-async",
    note: "X-Async-Mode + /images/async-generations poll",
  },
];

export function hostnameFromBaseUrl(baseURL: string): string {
  try {
    return new URL(baseURL).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    // bare host or invalid — best-effort strip
    return String(baseURL || "")
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      .split(":")[0]
      .toLowerCase();
  }
}

function hostMatches(ruleHost: string, actualHost: string): boolean {
  const r = ruleHost.toLowerCase().replace(/^\./, "");
  const a = actualHost.toLowerCase();
  return a === r || a.endsWith(`.${r}`);
}

/**
 * Look up a host rule for a baseURL.
 * Returns undefined when no rule matches (caller uses classic openai).
 */
export function matchHostRule(
  baseURL: string,
  rules: readonly HostRule[] = BUILTIN_HOST_RULES,
): HostRule | undefined {
  const host = hostnameFromBaseUrl(baseURL);
  if (!host) return undefined;
  return rules.find((rule) => hostMatches(rule.host, host));
}

/** Detect runtime mode from baseURL only (IC detect_image_request_mode style). */
export function detectModeFromHost(baseURL: string): RuntimeImageMode | undefined {
  return matchHostRule(baseURL)?.mode;
}
