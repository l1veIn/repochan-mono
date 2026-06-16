import { inspectProtocol, listAssets, listOrders } from "@repochan/core";
import type { RepoChanCliSettings } from "./settings.js";

export type WizardNextStep =
  | { kind: "guided"; initialMessage: string }
  | { kind: "phase"; args: string[] }
  | { kind: "app"; screen: "overview" | "orders" | "assets" };

export type WizardSnapshot = {
  protocol: Awaited<ReturnType<typeof inspectProtocol>>;
  orders: Awaited<ReturnType<typeof listOrders>>["orders"];
  assets: Awaited<ReturnType<typeof listAssets>>["assets"];
};

function statusOf(order: Record<string, unknown>) {
  return typeof order.status === "string" ? order.status : "";
}

function orderIdOf(order: Record<string, unknown>) {
  return typeof order.orderId === "string" ? order.orderId : undefined;
}

function approvedOrderId(orders: Array<Record<string, unknown>>) {
  return orderIdOf(orders.find((order) => ["approved", "in_progress"].includes(statusOf(order))) ?? {});
}

export async function inspectWizardSnapshot(cwd: string): Promise<WizardSnapshot> {
  const protocol = await inspectProtocol(cwd);
  const orders = protocol.exists ? (await listOrders(cwd)).orders : [];
  const assets = protocol.exists ? (await listAssets(cwd)).assets : [];
  return { protocol, orders, assets };
}

export function buildWizardInitialMessage(snapshot: WizardSnapshot, settings: RepoChanCliSettings) {
  const orderId = approvedOrderId(snapshot.orders as Array<Record<string, unknown>>);
  const lines = [
    "Run the RepoChan first-run wizard for this repository.",
    "Start by inspecting .repochan with the repochan tool action='protocol.inspect'.",
    "Guide the user from the current state toward the first drawable asset: analysis -> persona -> first asset order -> order approval -> painter execution or user-file import.",
    "Use RepoChan skills and the repochan tool for all protocol writes. Ask before overwrites, status changes, and image generation.",
    `Default first asset goal: ${settings.defaultGoal}.`,
  ];

  if (snapshot.assets.length > 0) {
    lines.push("Assets already exist. Summarize the delivered assets, then open the review/export path and suggest /repochan_panel or repochan app assets.");
  } else if (!snapshot.protocol.analysis) {
    lines.push("Current state: analysis is missing. Recommend and run only the Analyst step after user approval.");
  } else if (!snapshot.protocol.persona) {
    lines.push("Current state: analysis exists but persona is missing. Continue with the Creative Writer persona step after user approval.");
  } else if (snapshot.orders.length === 0) {
    lines.push("Current state: analysis and persona exist, but there are no orders. Create a first draft order for the default goal, then ask the user to approve it.");
  } else if (orderId) {
    lines.push(`Current state: approved/in-progress order ${orderId} exists. Continue to Painter for that order and stop at execution/import if image generation is unavailable.`);
  } else {
    lines.push("Current state: draft orders exist. Ask the user to review and approve one before Painter execution.");
  }

  if (settings.openAppAfterWizard) {
    lines.push("When the first-run path is complete or blocked at Painter execution/import, tell the user the RepoChan app will show the current state for review.");
  }

  return lines.join("\n");
}

export function chooseGenerateStep(snapshot: WizardSnapshot, settings: RepoChanCliSettings): WizardNextStep {
  const orderId = approvedOrderId(snapshot.orders as Array<Record<string, unknown>>);
  if (snapshot.assets.length > 0) return { kind: "app", screen: "assets" };
  if (!snapshot.protocol.analysis) return { kind: "phase", args: ["analysis"] };
  if (!snapshot.protocol.persona) return { kind: "phase", args: ["persona"] };
  if (orderId) return { kind: "phase", args: ["painter", "--order", orderId] };
  if (snapshot.orders.length > 0) return { kind: "app", screen: "orders" };
  return { kind: "phase", args: ["orders", "--goal", settings.defaultGoal] };
}

export function formatWizardSummary(snapshot: WizardSnapshot, settings: RepoChanCliSettings) {
  const next = chooseGenerateStep(snapshot, settings);
  const nextText =
    next.kind === "phase"
      ? `repochan phase ${next.args.join(" ")}`
      : next.kind === "app"
        ? `repochan app ${next.screen}`
        : "repochan";
  return [
    "RepoChan wizard",
    `.repochan: ${snapshot.protocol.exists ? "yes" : "no"}`,
    `analysis: ${snapshot.protocol.analysis ? "yes" : "missing"}`,
    `persona: ${snapshot.protocol.persona ? "yes" : "missing"}`,
    `orders: ${snapshot.orders.length}`,
    `assets: ${snapshot.assets.length}`,
    `defaultGoal: ${settings.defaultGoal}`,
    `next: ${nextText}`,
  ].join("\n");
}
