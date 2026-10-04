import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second, isolated build (e.g. the private-beta verification build in .next-beta) coexist
  // with the dev server's .next. Unset = the default.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Default (bottom-left) sat directly on top of the Sidebar's own footer
  // card ("GrowForge Ops · N agents") — moved to the one corner nothing
  // else in the shell occupies. Dev-only; has no effect in production.
  devIndicators: {
    position: "top-left",
  },
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  // pdf-parse (via pdfjs-dist) resolves its worker file at runtime in a way
  // Turbopack's server bundling breaks — this tells Next to leave it as a
  // real Node require instead of bundling it, which is the documented fix.
  serverExternalPackages: ["pdf-parse"],
  // Local voice authentication and user memory are runtime data, never release assets.
  outputFileTracingExcludes: {
    "*": ["./data/user_memories.json", "./data/.internal_voice_key"],
  },
};

export default nextConfig;
