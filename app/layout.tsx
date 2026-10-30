import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import "./globals.css";
import { copy } from "@/components/copy";

export const metadata: Metadata = {
  title: { default: copy.appName, template: `%s · ${copy.appName}` },
  description: copy.tagline,
};

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${text.variable} antialiased`}>
      <body className="font-sans text-base leading-relaxed">{children}</body>
    </html>
  );
}
