import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type PluginOption } from "vite";
import solid from "vite-plugin-solid";
import webExtension from "vite-plugin-web-extension";

const rootDir = import.meta.dirname;

// The web-extension plugin reads manifest.json, discovers entry points
// (background scripts, the action popup HTML), bundles the background as a
// self-contained script (IIFE) — which is what Firefox's event-page model
// requires, since it does not support ESM/service-worker backgrounds.
export default defineConfig({
  resolve: {
    alias: { src: resolve(rootDir, "src") },
  },
  plugins: [
    solid(),
    webExtension({
      manifest: () =>
        JSON.parse(readFileSync(resolve(rootDir, "manifest.json"), "utf-8")),
      browser: "firefox",
      // No auto-launch here; `yarn start` runs web-ext against dist/ instead.
      disableAutoLaunch: true,
      // The plugin validates against a schemastore schema whose command-key
      // regex is wrong for Firefox (it rejects Space and arrow keys, which
      // Firefox accepts). We validate with the authoritative `web-ext lint`
      // (via `yarn lint`) instead.
      skipManifestValidation: true,
      // Cast: the plugin bundles its own Vite copy, so its Plugin type is
      // nominally distinct from the root Vite's. Runtime behaviour is fine.
    }) as unknown as PluginOption,
  ],
});
