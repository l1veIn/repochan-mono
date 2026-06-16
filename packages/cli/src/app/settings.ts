import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";

export type RepoChanCliSettings = {
  language: "zh" | "en";
  defaultGoal: string;
  openAppAfterWizard: boolean;
  sessionPolicy: "continue" | "new";
};

export const DEFAULT_REPOCHAN_SETTINGS: RepoChanCliSettings = {
  language: defaultLanguage(),
  defaultGoal: "README hero and icon",
  openAppAfterWizard: true,
  sessionPolicy: "continue",
};

export function repochanHome() {
  return process.env.REPOCHAN_HOME || path.join(homedir(), ".repochan");
}

export function settingsPath() {
  return path.join(repochanHome(), "settings.yaml");
}

function defaultLanguage(): "zh" | "en" {
  const locale = `${process.env.LC_ALL || process.env.LANG || ""}`.toLowerCase();
  return locale.startsWith("zh") ? "zh" : "en";
}

function normalizeSettings(value: unknown): RepoChanCliSettings {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const language = raw.language === "en" || raw.language === "zh" ? raw.language : DEFAULT_REPOCHAN_SETTINGS.language;
  const defaultGoal = typeof raw.defaultGoal === "string" && raw.defaultGoal.trim() ? raw.defaultGoal.trim() : DEFAULT_REPOCHAN_SETTINGS.defaultGoal;
  const openAppAfterWizard = typeof raw.openAppAfterWizard === "boolean" ? raw.openAppAfterWizard : DEFAULT_REPOCHAN_SETTINGS.openAppAfterWizard;
  const sessionPolicy = raw.sessionPolicy === "new" || raw.sessionPolicy === "continue" ? raw.sessionPolicy : DEFAULT_REPOCHAN_SETTINGS.sessionPolicy;
  return { language, defaultGoal, openAppAfterWizard, sessionPolicy };
}

export async function loadRepoChanSettings(file = settingsPath()) {
  try {
    return normalizeSettings(parse(await readFile(file, "utf8")));
  } catch (error: any) {
    if (error?.code === "ENOENT") return { ...DEFAULT_REPOCHAN_SETTINGS };
    throw new Error(`Invalid RepoChan settings at ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function saveRepoChanSettings(settings: RepoChanCliSettings, file = settingsPath()) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, stringify(settings), "utf8");
}
