// Prints one version's section of CHANGELOG.md (Keep a Changelog format), for
// the GitHub Release notes (.github/workflows/release.yml):
//
//   node scripts/changelog-section.mjs 0.2.0 [CHANGELOG.md]
//
// Exits 1 when the version has no section or the section is empty.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The body of `## [version]` (everything up to the next `## ` heading or the
 * link references at the end), trimmed. Null when missing or empty.
 * @param {string} changelog
 * @param {string} version e.g. "0.2.0" (a leading "v" is ignored)
 * @returns {string | null}
 */
export function changelogSection(changelog, version) {
  const wanted = version.replace(/^v/, "");
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const match = /^## \[([^\]]+)\]/.exec(line);
    return match?.[1] === wanted;
  });
  if (start === -1) return null;

  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) break; // next version
    if (/^\[[^\]]+\]: \S+/.test(line)) break; // link references
    body.push(line);
  }
  const text = body.join("\n").trim();
  return text === "" ? null : text;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [version, file = "CHANGELOG.md"] = process.argv.slice(2);
  if (!version) {
    console.error("Usage: node scripts/changelog-section.mjs <version> [CHANGELOG.md]");
    process.exit(1);
  }
  const section = changelogSection(readFileSync(file, "utf8"), version);
  if (!section) {
    console.error(`No "## [${version.replace(/^v/, "")}]" section with entries in ${file}.`);
    process.exit(1);
  }
  console.log(section);
}
