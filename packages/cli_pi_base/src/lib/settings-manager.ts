import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";

export type RepoChanSettings = {
  uiLocale: "en" | "zh";
};

export const DEFAULT_SETTINGS: RepoChanSettings = {
  uiLocale: "en",
};

export const SETTINGS_PATH = path.join(homedir(), ".repochan", "settings.yaml");

let cachedSettings: RepoChanSettings | null = null;

async function ensureDir() {
  await mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
}

export async function loadSettings(): Promise<RepoChanSettings> {
  if (cachedSettings) return cachedSettings;
  try {
    const content = await readFile(SETTINGS_PATH, "utf8");
    const raw = parse(content) || {};
    if (raw.uiLocale !== "en" && raw.uiLocale !== "zh") {
      throw new Error(`${SETTINGS_PATH} must contain uiLocale: en or uiLocale: zh.`);
    }
    cachedSettings = { uiLocale: raw.uiLocale };
    return cachedSettings;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      cachedSettings = { ...DEFAULT_SETTINGS };
      return cachedSettings;
    }
    throw err;
  }
}

export async function saveSettings(settings: RepoChanSettings): Promise<void> {
  await ensureDir();
  await writeFile(SETTINGS_PATH, stringify(settings), "utf8");
  cachedSettings = settings;
}

export async function hasSettings(): Promise<boolean> {
  try {
    await readFile(SETTINGS_PATH, "utf8");
    return true;
  } catch (err: any) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

export async function getUiLocale(): Promise<"en" | "zh"> {
  const s = await loadSettings();
  return s.uiLocale;
}

export async function setUiLocale(locale: "en" | "zh"): Promise<void> {
  const s = await loadSettings();
  s.uiLocale = locale;
  await saveSettings(s);
}
