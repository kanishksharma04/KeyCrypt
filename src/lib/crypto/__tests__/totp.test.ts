import { describe, expect, it } from "vitest";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  generateTotpCode,
  generateTotpSecret,
  normalizeBackupCode,
  TotpKeyError,
  totpProvisioningUri,
  verifyTotpCode,
} from "../index";

const KEY = Buffer.alloc(32, 7).toString("base64");
const USER = "cuser000000000000000000001";

describe("TOTP codes", () => {
  it("matches the RFC 6238 SHA-1 test vector", () => {
    // RFC 6238 Appendix B: secret "12345678901234567890", T = 59 s → 94287082 (8 digits);
    // the 6-digit code is the last six digits.
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // base32 of the ASCII secret
    expect(generateTotpCode(secret, 59_000)).toBe("287082");
  });

  it("accepts the current code and one step either side, nothing further", () => {
    const secret = generateTotpSecret();
    const t = Date.UTC(2026, 10, 2, 13, 16, 0);
    const code = generateTotpCode(secret, t);
    expect(verifyTotpCode(secret, code, t)).toBe(true);
    expect(verifyTotpCode(secret, code, t + 30_000)).toBe(true);
    expect(verifyTotpCode(secret, code, t + 90_000)).toBe(false);
    expect(verifyTotpCode(secret, code.replace(/^(\d{3})/, "$1 "), t)).toBe(true); // "123 456"
  });

  it("rejects malformed codes and other secrets' codes", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "abcdef")).toBe(false);
    expect(verifyTotpCode(secret, "12345")).toBe(false);
    expect(verifyTotpCode(secret, generateTotpCode(generateTotpSecret()))).toBe(false);
  });

  it("builds an otpauth:// URI for authenticator apps", () => {
    const secret = generateTotpSecret();
    const uri = totpProvisioningUri(secret, "alice@example.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\/KeyCrypt:alice%40example\.com\?/);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("issuer=KeyCrypt");
  });
});

describe("backup codes", () => {
  it("generates 10 distinct grouped base32 codes", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
  });

  it("normalizes case and separators", () => {
    expect(normalizeBackupCode(" k7q2m-xw4pz ")).toBe("K7Q2MXW4PZ");
  });
});

describe("server-side encryption of the secret", () => {
  it("round-trips for the same user", async () => {
    const secret = generateTotpSecret();
    const stored = await encryptTotpSecret(secret, KEY, USER);
    expect(stored).not.toContain(secret);
    expect(await decryptTotpSecret(stored, KEY, USER)).toBe(secret);
  });

  it("fails for another user (AAD) or another key", async () => {
    const stored = await encryptTotpSecret(generateTotpSecret(), KEY, USER);
    await expect(decryptTotpSecret(stored, KEY, "cuser000000000000000000002")).rejects.toThrow();
    await expect(
      decryptTotpSecret(stored, Buffer.alloc(32, 8).toString("base64"), USER)
    ).rejects.toThrow();
  });

  it("rejects keys that are not 32 bytes", async () => {
    await expect(encryptTotpSecret("A", Buffer.alloc(16).toString("base64"), USER)).rejects.toThrow(
      TotpKeyError
    );
  });
});

describe("server TOTP key checks", () => {
  it("refuses a TOTP_ENCRYPTION_KEY that isn't base64", async () => {
    await expect(
      encryptTotpSecret(generateTotpSecret(), "not base64!!", USER)
    ).rejects.toBeInstanceOf(TotpKeyError);
    await expect(decryptTotpSecret("aaaa.bbbb", "%%%%", USER)).rejects.toBeInstanceOf(TotpKeyError);
  });
});
