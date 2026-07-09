import { FOUNDATION_ASSET_TYPES, findFoundationSheet, inspectProtocol, listOrders } from "@repochan/core";

export type OnboardingStep = "analysis" | "interview" | "persona" | "foundation-order" | "foundation-paint" | "complete";

export type OnboardingFacts = {
  hasProtocol: boolean;
  hasAnalysis: boolean;
  hasInterview: boolean;
  hasPersona: boolean;
  hasFoundationOrder: boolean;
  hasFoundationResult: boolean;
  orderCount: number;
  resultCount: number;
  foundationOrderId?: string;
  foundationVersionId?: string;
};

export type OnboardingProgress = OnboardingFacts & {
  complete: boolean;
  currentStep: OnboardingStep;
};

export function classifyOnboardingProgress(facts: OnboardingFacts): OnboardingProgress {
  let currentStep: OnboardingStep = "complete";
  if (!facts.hasProtocol || !facts.hasAnalysis) currentStep = "analysis";
  else if (!facts.hasPersona) currentStep = facts.hasInterview ? "persona" : "interview";
  else if (!facts.hasFoundationOrder) currentStep = "foundation-order";
  else if (!facts.hasFoundationResult) currentStep = "foundation-paint";

  return {
    ...facts,
    complete: currentStep === "complete",
    currentStep,
  };
}

export async function readOnboardingProgress(projectRoot: string): Promise<OnboardingProgress> {
  const protocol = await inspectProtocol(projectRoot);
  const ordersResult = protocol.exists ? await listOrders(projectRoot) : { orders: [] };
  const orders = Array.isArray(ordersResult.orders) ? ordersResult.orders : [];
  const foundationTypes = new Set<string>(FOUNDATION_ASSET_TYPES);
  const foundationOrder = orders.find((order: any) => !order.unreadable && foundationTypes.has(String(order.assetType ?? "")));
  const hasFoundationOrder = Boolean(foundationOrder);
  const foundation = protocol.exists ? await findFoundationSheet(projectRoot).catch(() => null) : null;
  const resultCount = orders.reduce((sum: number, order: any) => sum + (typeof order.resultCount === "number" ? order.resultCount : 0), 0);

  return classifyOnboardingProgress({
    hasProtocol: Boolean(protocol.exists),
    hasAnalysis: Boolean((protocol as { analysis?: unknown }).analysis),
    hasInterview: Boolean((protocol as { interview?: unknown }).interview),
    hasPersona: Boolean((protocol as { persona?: unknown }).persona),
    hasFoundationOrder,
    hasFoundationResult: Boolean(foundation),
    orderCount: orders.length,
    resultCount,
    foundationOrderId: foundation?.orderId ?? (foundationOrder as { orderId?: string } | undefined)?.orderId,
    foundationVersionId: foundation?.versionId,
  });
}
