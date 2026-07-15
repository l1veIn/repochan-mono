#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanCompatibilityDebt, scanReleaseSurfaceDebt } from "./release-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const findings = [
  ...await scanCompatibilityDebt(root),
  ...await scanReleaseSurfaceDebt(root),
];

if (findings.length > 0) {
  console.error("Current runtime/skill contracts contain compatibility debt:");
  for (const { path: file, line, rule, text } of findings) {
    console.error(`- ${file}:${line} [${rule}] ${text}`);
  }
  process.exitCode = 1;
} else {
  console.log("Compatibility-debt gate passed.");
}
