import path from "node:path";
import { root, exists, readInterviewArtifact, createOrUpdateInterview, appendToInterview } from "@repochan/core";
import { emitResult, type OutputOptions, UsageError } from "../lib/output.js";
import { readDataFile } from "../lib/data-file.js";

// repochan interview get
export async function runInterviewGet(cwd: string, options: OutputOptions) {
  const file = path.join(root(cwd), "interview", "current.json");
  if (!(await exists(file))) throw new UsageError("No interview found.");
  const data = await readInterviewArtifact(cwd);
  emitResult(options, JSON.stringify(data, null, 2), data);
}

// repochan interview create --data-file
export async function runInterviewCreate(cwd: string, dataFile: string | undefined, options: OutputOptions) {
  const params = readDataFile(dataFile);
  const { data, versionName } = await createOrUpdateInterview(cwd, params);
  emitResult(options, `Wrote interview current and interview/versions/${versionName}`, data);
}

// repochan interview append --data-file
export async function runInterviewAppend(cwd: string, dataFile: string | undefined, options: OutputOptions) {
  const params = readDataFile(dataFile);
  const { data, versionName } = await appendToInterview(cwd, params);
  emitResult(options, `Appended to interview and wrote interview/versions/${versionName}`, data);
}
