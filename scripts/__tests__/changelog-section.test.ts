import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { changelogSection } from "../changelog-section.mjs";

const SAMPLE = `# Changelog

Intro.

## [Unreleased]

## [0.3.0] - 2026-12-01

### Added

- Thing three

## [0.2.0] - 2026-11-10

### Added

- Thing two

### Fixed

- A bug

## 2026-11-07

- Older, undated by version

[Unreleased]: https://github.com/o/r/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/o/r/compare/v0.2.0...v0.3.0
`;

describe("changelogSection", () => {
  it("returns exactly one version's section", () => {
    expect(changelogSection(SAMPLE, "0.2.0")).toBe(
      "### Added\n\n- Thing two\n\n### Fixed\n\n- A bug"
    );
    expect(changelogSection(SAMPLE, "v0.3.0")).toBe("### Added\n\n- Thing three");
  });

  it("stops at the link references", () => {
    const last = SAMPLE.replace("## 2026-11-07\n\n- Older, undated by version\n\n", "");
    expect(changelogSection(last, "0.2.0")).not.toContain("[Unreleased]:");
  });

  it("returns null for a missing or empty section", () => {
    expect(changelogSection(SAMPLE, "9.9.9")).toBeNull();
    expect(changelogSection(SAMPLE, "Unreleased")).toBeNull();
    expect(changelogSection(SAMPLE, "0.2")).toBeNull();
  });
});

describe("CHANGELOG.md and package.json", () => {
  const root = resolve(__dirname, "../..");
  const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    version: string;
  };
  const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");

  it("has release notes for the current package.json version", () => {
    const notes = changelogSection(changelog, version);
    expect(notes).not.toBeNull();
    expect(changelog).toMatch(
      new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m")
    );
  });

  it("links every released version", () => {
    const versions = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((m) => m[1] ?? "");
    expect(versions.length).toBeGreaterThan(0);
    for (const v of versions) {
      expect(changelog).toMatch(
        new RegExp(`^\\[${v.replaceAll(".", "\\.")}\\]: https://github\\.com/`, "m")
      );
    }
    expect(changelog).toMatch(/^\[Unreleased\]: https:\/\/github\.com\//m);
  });
});
