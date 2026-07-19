import enDoc from "../../repochan/i18n/en.json";
import zhDoc from "../../repochan/i18n/zh.json";

// Locale assembly: repochan/i18n/<locale>.json holds every string the page
// consumes (meta + content). Routing plumbing (route/altRoute/lang) is
// derived here from the locale id — it is configuration, not copy.

const docs = { en: enDoc, zh: zhDoc } as const;

export type LocaleId = keyof typeof docs;

const routing: Record<LocaleId, { lang: string; route: string; altRoute: string; altLocale: LocaleId }> = {
  en: { lang: "en", route: "/", altRoute: "/zh/", altLocale: "zh" },
  zh: { lang: "zh-CN", route: "/zh/", altRoute: "/", altLocale: "en" },
};

export function getCopy(locale: LocaleId) {
  const doc = docs[locale];
  return {
    ...doc.content,
    locale,
    ...routing[locale],
    meta: { ...doc.meta, ogImage: doc.content.ogImage },
  };
}

export type Copy = ReturnType<typeof getCopy>;
