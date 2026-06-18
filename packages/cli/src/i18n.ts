import en from './locales/en.js';
import zh from './locales/zh.js';

import { loadSettings, saveSettings } from './lib/settings-manager.js';

type Key = keyof typeof en;
type Locale = Record<Key, string>;
type Lang = 'en' | 'zh';

const locales: Record<Lang, Locale> = {
  en,
  zh,
};

let currentLang: Lang = 'en';

/**
 * Call this once at startup (before creating any pages).
 * It loads the language from settings.yaml so that t() is up-to-date.
 */
export async function initLanguage() {
  try {
    const settings = await loadSettings();
    if (settings.language === 'en' || settings.language === 'zh') {
      currentLang = settings.language;
    }
  } catch {
    // keep default 'en'
  }
}

export function getLanguage(): Lang {
  return currentLang;
}

/**
 * Change language at runtime.
 * Updates in-memory value immediately (so UI refreshes can see it)
 * and persists to settings.yaml in the background.
 */
export async function setLanguage(lang: Lang): Promise<void> {
  if (lang === 'en' || lang === 'zh') {
    currentLang = lang;
    try {
      const settings = await loadSettings();
      settings.language = lang;
      await saveSettings(settings);
    } catch {
      // persistence failure should not break the UI
    }
  }
}

/**
 * Translation function. Synchronous after initLanguage() has been called.
 * Use this everywhere for strings that appear in the TUI.
 */
export function t(key: Key, vars?: Record<string, string | number>): string {
  let text = locales[currentLang][key] || String(key);

  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    });
  }

  return text;
}

export function getLangLabel(lang?: Lang): string {
  const l = lang || currentLang;
  return l === 'en' ? 'English' : '中文';
}

