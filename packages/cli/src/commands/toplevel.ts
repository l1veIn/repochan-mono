import {
  initProtocol,
  inspectProtocol,
  listOrders,
  validateProtocol,
  type ProtocolValidationProblem,
} from "@repochan/core";
import { asArray, bullet, dim, heading, printJson, type OutputOptions, yesNo } from "../lib/output.js";

// ---------------------------------------------------------------------------
// repochan init — initialize the .repochan/ protocol directory
// ---------------------------------------------------------------------------
export async function runInit(cwd: string, options: OutputOptions = {}) {
  await initProtocol(cwd);
  const summary = await inspectProtocol(cwd);
  if (options.json) return void printJson(summary);
  heading("RepoChan protocol initialized");
  bullet(".repochan", yesNo(summary.exists));
  bullet("root", summary.root);
  console.log(dim("\nNext: set up your agent with `repochan setup --agent <codex|claude|pi>`."));
}

// ---------------------------------------------------------------------------
// repochan status — protocol overview
// ---------------------------------------------------------------------------
export async function runStatus(cwd: string, options: OutputOptions = {}) {
  const protocol = await inspectProtocol(cwd);
  const orders = protocol.exists ? await listOrders(cwd) : { files: [], orders: [] };
  const resultCount = (orders.orders as any[]).reduce((sum, order) => sum + Number(order.resultCount ?? 0), 0);
  const overview = { protocol, orders, results: { count: resultCount } };
  if (options.json) return void printJson(overview);

  heading("RepoChan status");
  bullet(".repochan", yesNo(protocol.exists));
  bullet("analysis", yesNo(protocol.analysis));
  bullet("persona", yesNo(protocol.persona));
  bullet("analysis versions", asArray(protocol.analysisVersions).length);
  bullet("persona versions", asArray(protocol.personaVersions).length);
  bullet("orders", asArray(orders.orders).length);
  bullet("order results", resultCount);

  const active = asArray(orders.orders).filter((o: any) => o.status === "in_progress");
  if (active.length) {
    console.log("\nActive work:");
    for (const order of active as any[]) console.log(`- ${order.orderId ?? order.file} ${dim(String(order.assetType ?? ""))}`);
  }

  if (!protocol.exists) console.log(dim("\nNext: run `repochan init` to create the protocol directory."));
  else if (!protocol.analysis) console.log(dim("\nNext: run `repochan analysis run` to build the repository profile."));
  else if (!protocol.persona) console.log(dim("\nNext: ask your agent to generate a persona, then pipe JSON into `repochan persona create`."));
}

// ---------------------------------------------------------------------------
// repochan inspect — raw protocol inspection (= protocol inspect)
// ---------------------------------------------------------------------------
export async function runInspect(cwd: string, options: OutputOptions = {}) {
  const summary = await inspectProtocol(cwd);
  if (options.json) return void printJson(summary);
  heading("RepoChan protocol inspection");
  bullet("exists", yesNo(summary.exists));
  bullet("root", summary.root);
  bullet("analysis", yesNo(summary.analysis));
  bullet("persona", yesNo(summary.persona));
  bullet("interview", yesNo(summary.interview));
}

// ---------------------------------------------------------------------------
// repochan validate — validate protocol artifacts
// ---------------------------------------------------------------------------
export async function runValidate(cwd: string, options: OutputOptions = {}) {
  const result = await validateProtocol(cwd);
  if (options.json) return void printJson(result);
  heading("RepoChan protocol validation");
  bullet("status", result.ok ? "ok" : "needs attention");
  bullet("orders checked", result.checked.orders);
  bullet("results checked", result.checked.results);
  if (result.problems.length === 0 && result.warnings.length === 0) {
    console.log(dim("No protocol problems found."));
    return;
  }
  if (result.problems.length > 0) {
    console.log("\nProblems:");
    for (const issue of result.problems) printIssue("error:", issue);
  }
  if (result.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const issue of result.warnings) printIssue("warning:", issue);
  }
}

function printIssue(prefix: string, issue: ProtocolValidationProblem) {
  console.log(`- ${prefix} ${issue.message}`);
  if (issue.path) console.log(dim(`  path: ${issue.path}`));
  if (issue.suggestion) console.log(dim(`  suggestion: ${issue.suggestion}`));
}
