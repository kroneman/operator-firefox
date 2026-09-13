// Injects a version into package.json and manifest.json.
//
// Usage: node scripts/set-version.mjs <version>
// The version may carry a leading "v" (e.g. a git tag "v0.2.0"); it is stripped.
//
// manifest.json is the source of truth for the built extension (the Vite
// web-extension plugin reads it directly), but we keep package.json in sync so
// local tooling and `yarn version` reporting stay accurate.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");

const raw = process.argv[2];
if (!raw) {
  console.error("Usage: node scripts/set-version.mjs <version>");
  process.exit(1);
}

const version = raw.replace(/^v/, "");
// AMO requires a Mozilla-toolkit version: dot-separated numbers, each part
// optionally suffixed. Keep it simple and reject anything that isn't N.N.N.
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(
    `Invalid version "${raw}". Expected semver like 1.2.3 (optionally v-prefixed).`,
  );
  process.exit(1);
}

for (const file of ["package.json", "manifest.json"]) {
  const path = resolve(rootDir, file);
  const json = JSON.parse(readFileSync(path, "utf-8"));
  json.version = version;
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  console.log(`Set ${file} version to ${version}`);
}
