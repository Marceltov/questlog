// The web app's languages: English first (values V8), German, each a copy of every string in the same shape. Which one a page shows: the
// player's choice (a cookie, set by the switch in the header), else what their browser asks for, else English. Only the app's own words
// are translated; what the player filed stays as they filed it.
import { de } from "./de";
import { en } from "./en";

export type Copy = typeof en;
export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];
/** Each language under its own name, for the switch. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", de: "Deutsch" };
export const LOCALE_COOKIE = "questlog-lang";

const BY: Record<Locale, Copy> = { en, de };

export const copyFor = (locale: Locale): Copy => BY[locale];

const isLocale = (s: string | undefined): s is Locale => (LOCALES as readonly string[]).includes(s ?? "");

/** The cookie's language when it names one, else the first of Accept-Language's that the app has (by weight), else English. */
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  const asked = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((x) => x.trim()).find((x) => x.startsWith("q="));
      return { lang: tag.split("-")[0].toLowerCase(), q: q ? Number(q.slice(2)) || 0 : 1 };
    })
    .filter((x) => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q);
  return asked.map((x) => x.lang).find(isLocale) ?? "en";
}
