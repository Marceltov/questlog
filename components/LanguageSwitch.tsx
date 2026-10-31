"use client";
// The language switch in the header: the choice goes into a cookie for a year, and the page renders again in it.
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALE_NAMES, LOCALES, type Locale } from "./copy";
import { useCopy, useLocale } from "./copy/client";

export function LanguageSwitch() {
  const router = useRouter();
  const locale = useLocale();
  const copy = useCopy();
  function choose(l: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }
  return (
    <select
      aria-label={copy.language}
      className="rounded-md border border-rule bg-transparent px-1.5 py-0.5 text-sm text-muted hover:text-accent"
      value={locale}
      onChange={(e) => choose(e.target.value as Locale)}
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_NAMES[l]}
        </option>
      ))}
    </select>
  );
}
