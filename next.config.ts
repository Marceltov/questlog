import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pino and better-sqlite3 (a native module) stay plain Node requires, so the standalone build traces them into node_modules.
  serverExternalPackages: ["pino", "better-sqlite3"],
  // The consent page hands a code to whatever host the client registered: no framing it (clickjacking the "Allow" click).
  headers: async () => [{ source: "/(login|consent)", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] }],
  // Gamepanion doesn't use next/image: the optimizer stays off, and sharp stays out of the image.
  images: { unoptimized: true },
  outputFileTracingExcludes: { "*": ["node_modules/sharp/**", "node_modules/@img/**"] },
};

export default nextConfig;
