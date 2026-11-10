import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUDIT_RETENTION_DAYS } from "@/lib/audit";
import PrivacyPage from "../privacy/page";
import TermsPage from "../terms/page";

/** The page as plain text, the way a reader sees it. */
function text(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;|[“”]/g, '"')
    .replace(/’/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const threatModel = readFileSync(resolve(__dirname, "../../../docs/threat-model.md"), "utf8");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/privacy agrees with docs/threat-model.md", () => {
  const page = text(<PrivacyPage />);

  it("lists what the server never receives", () => {
    for (const s of ["master password", "vault key", "recovery key", "decrypted data"]) {
      expect(page).toContain(s);
    }
    expect(threatModel).toMatch(
      /\*\*Never\*\*: the master password, the vault key, the recovery key/
    );
  });

  it("lists what the server stores", () => {
    for (const s of [
      "email address and name",
      "Argon2id hash of your account password",
      "ciphertext",
      "each item's type",
      "favourite",
      "which folder it is in",
      "created and last updated",
      "how many items you have and roughly how large each one is",
      "IP address",
      "browser",
      "Rate-limit keys",
    ]) {
      expect(page).toContain(s);
    }
  });

  it("states the same activity-log retention as the code and the threat model", () => {
    expect(page).toContain(`kept for ${AUDIT_RETENTION_DAYS} days`);
    expect(threatModel).toContain(`kept for **${AUDIT_RETENTION_DAYS} days**`);
  });

  it("covers the opt-in HIBP check, no analytics or ads, and account deletion", () => {
    expect(page).toContain("opt-in");
    expect(page).toContain("first 5 characters of the hash");
    expect(threatModel).toContain("first 5 hex characters");
    expect(page).toContain("no analytics, no advertising");
    expect(page).toContain("delete your account");
    expect(page).toContain("can't be undone");
  });
});

describe("/terms", () => {
  it("says the service is provided as is under the MIT license", () => {
    const page = text(<TermsPage />);
    expect(page).toContain("MIT license");
    expect(page).toContain('"as is"');
    expect(page).toContain("without warranty of any kind");
  });

  it("makes the user responsible for the master password and recovery key", () => {
    const page = text(<TermsPage />);
    expect(page).toContain(
      "If you lose both your master password and your recovery key, your vault can't be decrypted or recovered by anyone."
    );
  });
});

describe("operator contact on both pages", () => {
  it("shows a neutral placeholder without OPERATOR_CONTACT", () => {
    vi.stubEnv("OPERATOR_CONTACT", "");
    for (const Page of [PrivacyPage, TermsPage]) {
      expect(text(<Page />)).toContain("the operator of this KeyCrypt instance");
    }
  });

  it("links the configured contact", () => {
    vi.stubEnv("OPERATOR_CONTACT", "privacy@example.com");
    for (const Page of [PrivacyPage, TermsPage]) {
      expect(renderToStaticMarkup(<Page />)).toContain('href="mailto:privacy@example.com"');
    }
  });
});
