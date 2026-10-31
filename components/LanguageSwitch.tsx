"use client";
// The language switch in the header: a flag per language, the one in use ringed. The choice goes into a cookie for a year, and the page
// renders again in it. A flag stands for a country, not a language, so each button is named by the language in its own words (Deutsch,
// English) for screen readers and the tooltip; the flag is only the picture.
import { useRouter } from "next/navigation";
import { useId } from "react";
import { LOCALE_COOKIE, LOCALE_NAMES, LOCALES, type Locale } from "./copy";
import { useCopy, useLocale } from "./copy/client";

export function LanguageSwitch() {
  const router = useRouter();
  const locale = useLocale();
  const copy = useCopy();
  function choose(l: Locale) {
    if (l === locale) return;
    remember(l);
    router.refresh();
  }
  return (
    <div role="group" aria-label={copy.language} className="flex items-center gap-1.5">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-label={LOCALE_NAMES[l]}
          aria-pressed={l === locale}
          title={LOCALE_NAMES[l]}
          className="flag"
          onClick={() => choose(l)}
        >
          <Flag locale={l} />
        </button>
      ))}
    </div>
  );
}

// The choice, for a year, read on the server by components/copy/server.ts.
function remember(l: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
}

function Flag({ locale }: { locale: Locale }) {
  // useId may hold characters that url(#…) doesn't take.
  const id = useId().replace(/[^\w-]/g, "");
  if (locale === "de")
    return (
      <svg viewBox="0 0 5 3" preserveAspectRatio="none" aria-hidden="true">
        <rect width="5" height="1" y="0" fill="#000" />
        <rect width="5" height="1" y="1" fill="#dd0000" />
        <rect width="5" height="1" y="2" fill="#ffce00" />
      </svg>
    );
  // The Union Jack: its red diagonals are offset from the white ones, which the clip path does.
  return (
    <svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <clipPath id={`${id}t`}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${id}t)`} stroke="#c8102e" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
    </svg>
  );
}
