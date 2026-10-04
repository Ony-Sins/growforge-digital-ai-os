import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

/**
 * Removes owner-machine files from the Cloudflare build output:
 *  - public/uploads (the local owner's avatar / cover / logo) and public/generated (local ComfyUI output):
 *    Vite copies public/ into the Workers static-asset directory, and static assets are served BEFORE the
 *    Worker (and therefore before proxy.ts) runs - they would be publicly downloadable from the beta.
 *  - dist/server/.dev.vars: @cloudflare/vite-plugin copies .env.local (every real provider key, the vault
 *    key, AUTH_SECRET) there for local previews. The beta must never run with those, even locally; the
 *    preview is given an explicit beta-only env file instead (see .dev.vars.example).
 */
function stripOwnerLocalFiles(): Plugin {
  return {
    name: "growforge:strip-owner-local-files",
    apply: "build",
    closeBundle() {
      for (const rel of ["dist/client/uploads", "dist/client/generated", "dist/server/.dev.vars"]) {
        const target = path.resolve(rel);
        if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
      }
      const chunksDir = path.resolve("dist/client/_next/static/chunks");
      if (fs.existsSync(chunksDir)) {
        const privatePrefixes = [
          "SettingsOverlay",
          "AiModelManager",
          "IntegrationsHub",
          "InterfaceAccessCard",
          "ByokOnboardingBanner",
          "VaultLibraryOverlay",
          "UserProfileOverlay",
          "AgentDetailPanel",
          "AgentRosterOverlay",
          "PinPromptModal",
          "agents-",
        ];
        for (const file of fs.readdirSync(chunksDir)) {
          if (privatePrefixes.some((p) => file.startsWith(p))) {
            fs.rmSync(path.join(chunksDir, file), { force: true });
          }
        }
      }
    },
  };
}

/**
 * The beta's public directory: a copy of public/ WITHOUT the owner-machine folders. vinext also embeds the
 * list of public file names into the server bundle, so the owner's upload file names must never be in the
 * directory it scans - stripping the output afterwards is not enough. Staged under .vinext/ (gitignored).
 */
const OWNER_LOCAL_PUBLIC = new Set(["uploads", "generated"]);
function stageBetaPublicDir(): string {
  const staged = path.resolve(".vinext/beta-public");
  fs.rmSync(staged, { recursive: true, force: true });
  fs.cpSync(path.resolve("public"), staged, {
    recursive: true,
    filter: (src) => !OWNER_LOCAL_PUBLIC.has(path.relative(path.resolve("public"), src).split(path.sep)[0]),
  });
  return staged;
}

// Cloudflare Workers build path (vinext). Runs alongside - never instead of - `next dev` / `next build`,
// which still own local development and the Vercel deployment.
export default defineConfig({
  publicDir: stageBetaPublicDir(),
  // Tailwind v4 goes through its Vite plugin here; postcss.config.mjs stays Next.js-only (not applied twice).
  css: { postcss: {} },
  // pkce-challenge (pulled in by the MCP SDK's OAuth client, unreachable in the beta) publishes no export for the
  // "workerd" condition, which breaks dev-server dependency pre-bundling. The production build is unaffected.
  environments: {
    rsc: { optimizeDeps: { exclude: ["pkce-challenge"] } },
    ssr: { optimizeDeps: { exclude: ["pkce-challenge"] } },
  },
  plugins: [
    tailwindcss(),
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
    stripOwnerLocalFiles(),
  ],
});
