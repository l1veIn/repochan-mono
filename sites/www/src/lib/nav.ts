import type { Locale } from "./i18n/types";
import type { SiteContent } from "./i18n/types";

/** Rewrite section hashes to home-page anchors when not on the home page. */
export function navForSubpage(nav: SiteContent["nav"], locale: Locale): SiteContent["nav"] {
  const home = locale === "zh" ? "/" : "/en/";
  return {
    ...nav,
    links: nav.links.map((l) => ({
      ...l,
      href: l.href.startsWith("#") ? `${home}${l.href}` : l.href,
    })),
  };
}
