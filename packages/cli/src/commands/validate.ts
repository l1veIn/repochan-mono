import { validateProtocol, type ProtocolValidationProblem } from "@repochan/core";
import { bullet, dim, heading, printJson, type OutputOptions } from "../ui/output.js";

function printIssue(prefix: string, issue: ProtocolValidationProblem) {
  console.log(`- ${prefix} ${issue.message}`);
  if (issue.path) console.log(dim(`  path: ${issue.path}`));
  if (issue.suggestion) console.log(dim(`  suggestion: ${issue.suggestion}`));
}

export async function runValidate(cwd: string, options: OutputOptions) {
  const result = await validateProtocol(cwd);

  if (options.json) {
    printJson(result);
    return;
  }

  heading("RepoChan protocol validation");
  bullet("status", result.ok ? "ok" : "needs attention");
  bullet("orders checked", result.checked.orders);
  bullet("assets checked", result.checked.assets);

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
