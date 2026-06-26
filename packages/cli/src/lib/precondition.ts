import path from "node:path";

import {
  inspectProtocol,
  findFoundationSheet,
  listOrders,
  protocolRoot,
  readJsonIfExists,
} from "@repochan/core";

export type PreconditionResult = {
  /** true = can proceed, false = blocked */
  ok: boolean;
  /** blocking error message when ok=false */
  blockReason?: string;
  /** warning messages (non-blocking) */
  warnings: string[];
  /** loaded data */
  analysis: any | null;
  persona: any | null;
  foundation: { orderId: string; versionId: string; assetType: string; files: string[] } | null;
  hasProtocol: boolean;
};

export async function checkPreconditions(
  projectRoot: string,
  requirements: { analysis?: boolean; persona?: boolean; foundation?: boolean; protocol?: boolean },
): Promise<PreconditionResult> {
  const warnings: string[] = [];

  const protocol = await inspectProtocol(projectRoot);
  const hasProtocol: boolean = Boolean(protocol.exists);

  // Auto-init protocol if needed (non-destructive)
  if (requirements.protocol && !hasProtocol) {
    warnings.push("No .repochan/ directory found — will be auto-initialized.");
  }

  const analysis = await readJsonIfExists(path.join(protocolRoot(projectRoot), "analysis", "current.json"));
  const persona = await readJsonIfExists(path.join(protocolRoot(projectRoot), "persona", "current.json"));
  const foundation = await findFoundationSheet(projectRoot).catch(() => null);

  // Check analysis requirement
  if (requirements.analysis && !analysis) {
    return {
      ok: false,
      blockReason: "未找到分析报告。请先运行 `repochan analyze`。",
      warnings,
      analysis: null,
      persona,
      foundation,
      hasProtocol,
    };
  }

  // Check persona requirement
  if (requirements.persona && !persona) {
    return {
      ok: false,
      blockReason: "未找到人设。请先运行 `repochan persona`。",
      warnings,
      analysis,
      persona: null,
      foundation,
      hasProtocol,
    };
  }

  // Check foundation requirement
  if (requirements.foundation && !foundation) {
    return {
      ok: false,
      blockReason: "未找到设定集封面。请先运行 `repochan foundation`。",
      warnings,
      analysis,
      persona,
      foundation: null,
      hasProtocol,
    };
  }

  // Schema version warnings
  if (analysis && analysis.schemaVersion !== "repochan.analysis.v1") {
    warnings.push(`Analysis schema version is '${analysis.schemaVersion}', expected 'repochan.analysis.v1'. Consider re-running analyze.`);
  }

  return { ok: true, warnings, analysis, persona, foundation, hasProtocol };
}

/** Check if an order exists and its status is valid for painting. */
export async function checkOrderForPainting(
  projectRoot: string,
  orderId: string,
): Promise<{ ok: boolean; order: any | null; blockReason?: string }> {
  const { orders } = await listOrders(projectRoot);
  const summary = orders.find((o: any) => o.orderId === orderId);
  if (!summary) {
    return { ok: false, order: null, blockReason: `Order '${orderId}' not found.` };
  }
  return { ok: true, order: summary };
}
