import { promises as fs } from "node:fs";
import path from "node:path";

export const PROTOCOL_DIR = ".repochan";

export function stamp() {
  return new Date().toISOString();
}

export function stampForPath() {
  return stamp().replace(/[:.]/g, "-");
}

export function protocolRoot(projectRoot: string) {
  return path.join(projectRoot, PROTOCOL_DIR);
}

export const root = protocolRoot;

export function stripProtocolPrefix(inputPath: string) {
  return inputPath.startsWith(PROTOCOL_DIR)
    ? inputPath.slice(PROTOCOL_DIR.length).replace(/^[/\\]+/, "")
    : inputPath.replace(/^[/\\]+/, "");
}

export function safeProtocolPath(projectRoot: string, inputPath: string) {
  const rel = stripProtocolPrefix(inputPath);
  const resolved = path.resolve(protocolRoot(projectRoot), rel);
  const protocolRootPath = path.resolve(protocolRoot(projectRoot));
  if (resolved !== protocolRootPath && !resolved.startsWith(protocolRootPath + path.sep)) {
    throw new Error(`Refusing to access path outside ${PROTOCOL_DIR}: ${inputPath}`);
  }
  return resolved;
}

export async function exists(file: string) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(file: string) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export async function readJsonIfExists(file: string) {
  return (await exists(file)) ? readJson(file) : undefined;
}

export async function writeJson(file: string, data: unknown, overwrite = false) {
  if (!overwrite && (await exists(file))) {
    throw new Error(`Refusing to overwrite existing artifact without overwrite=true: ${file}`);
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function initProtocol(projectRoot: string, options?: { language?: "zh" | "en" }) {
  const r = protocolRoot(projectRoot);
  const dirs = [
    r,
    path.join(r, "analysis.versions"),
    path.join(r, "persona", "versions"),
    path.join(r, "orders"),
  ];
  await Promise.all(dirs.map((dir) => fs.mkdir(dir, { recursive: true })));

  // Write default config.json if not exists
  const configPath = path.join(r, "config.json");
  if (!(await exists(configPath))) {
    await writeJson(configPath, {
      schemaVersion: "repochan.config.v1",
      language: options?.language ?? "en",
    }, false);
  }
}

export async function readConfig(projectRoot: string): Promise<{ language: "zh" | "en"; [key: string]: unknown }> {
  const configPath = path.join(protocolRoot(projectRoot), "config.json");
  const config = await readJsonIfExists(configPath);
  return config ?? { language: "en" as const };
}

export async function writeConfig(projectRoot: string, patch: Record<string, unknown>) {
  const r = protocolRoot(projectRoot);
  const configPath = path.join(r, "config.json");
  const current = await readConfig(projectRoot);
  await writeJson(configPath, { ...current, ...patch }, true);
}

export async function inspectProtocol(projectRoot: string) {
  const r = protocolRoot(projectRoot);
  const summary: Record<string, unknown> = { exists: await exists(r), root: PROTOCOL_DIR };
  summary.analysis = await exists(path.join(r, "analysis.json"));
  summary.persona = await exists(path.join(r, "persona", "current.json"));
  try {
    summary.analysisVersions = (await fs.readdir(path.join(r, "analysis.versions"))).filter((f) => f.endsWith(".json"));
  } catch {
    summary.analysisVersions = [];
  }
  try {
    summary.personaVersions = (await fs.readdir(path.join(r, "persona", "versions"))).filter((f) => f.endsWith(".json"));
  } catch {
    summary.personaVersions = [];
  }
  try {
    const orderEntries = await fs.readdir(path.join(r, "orders"), { withFileTypes: true });
    summary.orders = orderEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    summary.orderVersions = Object.fromEntries(
      await Promise.all(
        (summary.orders as string[]).map(async (orderId) => {
          try {
            const versions = (await fs.readdir(path.join(r, "orders", orderId, "versions"), { withFileTypes: true }))
              .filter((entry) => entry.isDirectory())
              .map((entry) => entry.name)
              .sort();
            return [orderId, versions];
          } catch {
            return [orderId, []];
          }
        }),
      ),
    );
  } catch {
    summary.orders = [];
    summary.orderVersions = {};
  }
  summary.assets = [];
  return summary;
}

export function protocolVersionPath(strippedArtifactPath: string, stampValue = stampForPath()) {
  const clean = stripProtocolPrefix(strippedArtifactPath).split(/[\\/]+/).join("/");
  if (clean === "analysis.json") return path.join("analysis.versions", `${stampValue}.json`);
  if (clean === "persona/current.json") return path.join("persona", "versions", `${stampValue}.json`);
  return path.join(path.dirname(clean), "versions", `${stampValue}.json`);
}

export function relativeProtocolPath(projectRoot: string, file: string) {
  return path.relative(projectRoot, file).split(path.sep).join("/");
}

function validateOrderIdForPath(orderId: string) {
  if (!/^ord-[a-z0-9][a-z0-9-]*$/.test(orderId)) throw new Error("orderId must match ^ord-[a-z0-9][a-z0-9-]*$.");
  return orderId;
}

function validateVersionIdForPath(versionId: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(versionId)) throw new Error("versionId must match ^[A-Za-z0-9][A-Za-z0-9_.-]*$.");
  return versionId;
}

export function orderDir(projectRoot: string, orderId: string) {
  return path.join(protocolRoot(projectRoot), "orders", validateOrderIdForPath(orderId));
}

export function orderJsonPath(projectRoot: string, orderId: string) {
  return path.join(orderDir(projectRoot, orderId), "order.json");
}

export function orderVersionsDir(projectRoot: string, orderId: string) {
  return path.join(orderDir(projectRoot, orderId), "versions");
}

export function orderVersionDir(projectRoot: string, orderId: string, versionId: string) {
  return path.join(orderVersionsDir(projectRoot, orderId), validateVersionIdForPath(versionId));
}

export async function listJsonFiles(dir: string) {
  try {
    return (await fs.readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

export async function requireAnalysis(projectRoot: string) {
  const file = path.join(protocolRoot(projectRoot), "analysis.json");
  if (!(await exists(file))) throw new Error("Missing .repochan/analysis.json. Run repochan action='analysis.run' first.");
}

export async function requirePersona(projectRoot: string) {
  const file = path.join(protocolRoot(projectRoot), "persona", "current.json");
  if (!(await exists(file))) throw new Error("Missing .repochan/persona/current.json. Run repochan action='persona.create' first.");
}
