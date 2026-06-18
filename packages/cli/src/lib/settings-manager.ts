import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";

export type RepoChanSettings = {
  language: "en" | "zh";
};

export const DEFAULT_SETTINGS: RepoChanSettings = {
  language: "en",
};

const SETTINGS_PATH = path.join(homedir(), ".repochan", "settings.yaml");

let cachedSettings: RepoChanSettings | null = null;

async function ensureDir() {
  await mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
}

export async function loadSettings(): Promise<RepoChanSettings> {
  if (cachedSettings) return cachedSettings;
  try {
    const content = await readFile(SETTINGS_PATH, "utf8");
    const raw = parse(content) || {};
    const language = raw.language === "en" || raw.language === "zh" ? raw.language : DEFAULT_SETTINGS.language;
    cachedSettings = { language };
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

export async function getLanguage(): Promise<"en" | "zh"> {
  const s = await loadSettings();
  return s.language;
}

export async function setLanguage(lang: "en" | "zh"): Promise<void> {
  const s = await loadSettings();
  s.language = lang;
  await saveSettings(s);
}
