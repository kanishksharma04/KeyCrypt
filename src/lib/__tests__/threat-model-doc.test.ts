import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { AUDIT_RETENTION_DAYS } from "@/lib/audit";
import { CLIPBOARD_CLEAR_MS } from "@/lib/clipboard";
import { HIDDEN_LOCK_MS, INACTIVITY_MS } from "@/lib/vault-lock";
import { REAUTH_TTL_MS } from "@/lib/reauth";
import { SESSION_MAX_AGE_S } from "@/lib/auth.config";
import { TOKEN_VERSION_CHECK_INTERVAL_MS } from "@/lib/session-version";
import {
  DEFAULT_ARGON2ID_PARAMS,
  folderAad,
  itemAad,
  PBKDF2_ITERATIONS,
  RECOVERY_KEY_BYTES,
  SALT_LENGTH,
} from "@/lib/crypto";

// docs/threat-model.md states concrete parameters; keep them in step with the code.

const doc = readFileSync(resolve(__dirname, "../../../docs/threat-model.md"), "utf8");
const securityTxt = readFileSync(
  resolve(__dirname, "../../../public/.well-known/security.txt"),
  "utf8"
);

const fmt = (n: number) => n.toLocaleString("en");

describe("docs/threat-model.md matches the code", () => {
  it.each([
    ["Argon2id memory", `${DEFAULT_ARGON2ID_PARAMS.memoryKiB / 1024} MiB memory`],
    [
      "Argon2id iterations",
      `${DEFAULT_ARGON2ID_PARAMS.iterations} iterations, parallelism ${DEFAULT_ARGON2ID_PARAMS.parallelism}`,
    ],
    ["salt length", `${SALT_LENGTH}-byte salt`],
    ["PBKDF2 iterations", `${fmt(PBKDF2_ITERATIONS)} iterations`],
    ["recovery key size", `${RECOVERY_KEY_BYTES * 8} random bits`],
    ["audit retention", `kept for **${AUDIT_RETENTION_DAYS} days**`],
    ["clipboard clear", `${CLIPBOARD_CLEAR_MS / 1000} seconds after a copy`],
    ["idle lock", `${INACTIVITY_MS / 60_000} minutes of inactivity`],
    ["hidden-tab lock", `${HIDDEN_LOCK_MS / 60_000} minutes in a hidden tab`],
    ["re-auth window", `within the last ${REAUTH_TTL_MS / 60_000} minutes`],
    ["session age", `${SESSION_MAX_AGE_S / 86_400}-day maximum`],
    ["revocation delay", `within ${TOKEN_VERSION_CHECK_INTERVAL_MS / 1000} seconds`],
  ])("%s", (_label, text) => {
    expect(doc).toContain(text);
  });

  it("describes the AAD formats the code uses", () => {
    expect(itemAad({ userId: "U", itemId: "I", type: "T" })).toBe("kc:v2|U|I|T");
    expect(doc).toContain("`kc:v2|<userId>|<itemId>|<type>`");
    expect(folderAad({ userId: "U", folderId: "F" })).toBe("kc:v2-folder|U|F");
    expect(doc).toContain("`kc:v2-folder|<userId>|<folderId>`");
  });

  it("lists rollback, withheld items and metadata changes as not covered while the AAD has no version", () => {
    // The item AAD has no version field. If one is added, revisit "Attacks not covered".
    expect(itemAad({ userId: "U", itemId: "I", type: "T" }).split("|")).toHaveLength(4);
    const notCovered = doc.slice(
      doc.indexOf("## Attacks not covered"),
      doc.indexOf("\n## ", doc.indexOf("## Attacks not covered") + 1)
    );
    expect(notCovered).toContain("**Rolling an item back to an older version.**");
    expect(notCovered).toContain("**Withholding or deleting items.**");
    expect(notCovered).toContain("**Changing plain-text metadata.**");
    expect(doc).toMatch(/\| Swapping or replaying ciphertext between rows +\| Between rows only:/);
    expect(doc).toContain("## Future work");
  });
});

describe("public/.well-known/security.txt (RFC 9116)", () => {
  const field = (name: string) => securityTxt.match(new RegExp(`^${name}: (.+)$`, "m"))?.[1];

  it("has a Contact, a future Expires within a year or so, and a Policy", () => {
    expect(field("Contact")).toBe(
      "https://github.com/kanishksharma04/KeyCrypt/security/advisories/new"
    );
    expect(field("Policy")).toMatch(/\/SECURITY\.md$/);
    const expires = new Date(field("Expires") ?? "");
    expect(Number.isNaN(expires.getTime())).toBe(false);
    // RFC 9116 recommends less than a year ahead of publication.
    expect(expires.toISOString()).toBe("2027-11-03T00:00:00.000Z");
  });
});
