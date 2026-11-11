// pnpm ext:package: builds the extension for Chromium and Firefox and writes one
// zip per store into extension/packages/:
//   keycrypt-<version>-chrome.zip   (Chrome Web Store, Edge Add-ons)
//   keycrypt-<version>-firefox.zip  (addons.mozilla.org)
//
// KEYCRYPT_APP_URL must be the https:// address of the KeyCrypt instance the
// packaged extension talks to (it is baked into the build). Pass --allow-local
// to package a local build (http://localhost) for testing only.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createZip } from "./zip.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const allowLocal = process.argv.includes("--allow-local");

const appUrl = process.env.KEYCRYPT_APP_URL ?? "";
let parsed;
try {
  parsed = new URL(appUrl);
} catch {
  parsed = null;
}
if (!parsed || (parsed.protocol !== "https:" && !allowLocal)) {
  console.error(
    "Set KEYCRYPT_APP_URL to your KeyCrypt instance's https:// address, e.g.\n" +
      "  KEYCRYPT_APP_URL=https://vault.example.com pnpm ext:package\n" +
      "(--allow-local packages a http://localhost build, for testing only)."
  );
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const outDir = join(root, "packages");
mkdirSync(outDir, { recursive: true });

/** @param {string} dir */
function files(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else out.push(path);
  }
  return out;
}

for (const target of ["chrome", "firefox"]) {
  console.log(`Building for ${target}…`);
  execFileSync("pnpm", ["exec", "vite", "build"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, KEYCRYPT_BROWSER: target, KEYCRYPT_EXTRA_HOST_PERMISSIONS: "" },
  });
  const dist = join(root, "dist", target);
  const entries = files(dist).map((path) => ({
    name: relative(dist, path).split("\\").join("/"),
    data: readFileSync(path),
  }));
  const zipPath = join(outDir, `keycrypt-${version}-${target}.zip`);
  writeFileSync(zipPath, createZip(entries));
  console.log(`Wrote ${relative(root, zipPath)} (${entries.length} files)`);
}
