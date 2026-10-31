"use client";
// The page's language for client components: the root layout picks it on the server and hands it down, so both render the same words.
import { createContext, useContext, type ReactNode } from "react";
import { copyFor, type Locale } from ".";

const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);
export const useCopy = () => copyFor(useLocale());
