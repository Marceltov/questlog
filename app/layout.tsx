import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/components/copy/client";
import { serverCopy, serverLocale } from "@/components/copy/server";

export async function generateMetadata(): Promise<Metadata> {
  const copy = await serverCopy();
  return {
    title: { default: copy.appName, template: `%s · ${copy.appName}` },
    description: copy.tagline,
    // On an iPhone's home screen it opens without Safari's bars, under its own name (the manifest says the same for everyone else).
    appleWebApp: { capable: true, title: copy.appName, statusBarStyle: "default" },
  };
}

// Phone first: the web app is for looking things up next to the screen.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { color: "#f6f2ea", media: "(prefers-color-scheme: light)" },
    { color: "#16171d", media: "(prefers-color-scheme: dark)" },
  ],
};

// Atkinson Hyperlegible, served from the app itself (next/font downloads it at build time).
const text = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-text", display: "swap" });

// The page's language, picked once here (components/copy), is the document's and every client component's.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await serverLocale();
  return (
    <html lang={locale} className={`${text.variable} antialiased`}>
      <body className="font-sans text-base leading-relaxed">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
