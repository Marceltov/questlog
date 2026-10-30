import type { MetadataRoute } from "next";
import { copy } from "@/components/copy";

// Added to a home screen, questlog opens as an app of its own: no browser bar, the journal's paper behind it while it loads. The icons
// come from scripts/icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: copy.appName,
    short_name: copy.appName,
    description: copy.tagline,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f2ea",
    theme_color: "#f6f2ea",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
