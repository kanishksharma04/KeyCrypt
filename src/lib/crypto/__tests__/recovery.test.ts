import { describe, expect, it } from "vitest";
import {
  deriveRecoveryKek,
  formatRecoveryKey,
  generateRecoveryKey,
  generateVaultKey,
  parseRecoveryKey,
  RecoveryKeyFormatError,
  unwrapVaultKey,
  VaultKeyUnwrapError,
  wrapVaultKey,
} from "../index";

const USER = "cuser000000000000000000001";

describe("recovery key format", () => {
  it("is 128 random bits shown as grouped base32", () => {
    const { bytes, text } = generateRecoveryKey();
    expect(bytes.byteLength).toBe(16);
    expect(text).toMatch(/^([A-Z2-7]{4}-){6}[A-Z2-7]{2}$/);
    expect(generateRecoveryKey().text).not.toBe(text);
  });

  it("round-trips, ignoring case, spaces and dashes", () => {
    const { bytes, text } = generateRecoveryKey();
    expect(parseRecoveryKey(text)).toEqual(bytes);
    expect(parseRecoveryKey(text.toLowerCase())).toEqual(bytes);
    expect(parseRecoveryKey(text.replace(/-/g, " "))).toEqual(bytes);
    expect(parseRecoveryKey(` ${text.replace(/-/g, "")} `)).toEqual(bytes);
  });

  it("encodes known bytes deterministically", () => {
    expect(formatRecoveryKey(new Uint8Array(16))).toBe("AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA");
    expect(formatRecoveryKey(new Uint8Array(16).fill(255))).toBe(
      "7777-7777-7777-7777-7777-7777-74"
    );
  });

  it("rejects text that is not a recovery key", () => {
    const { text } = generateRecoveryKey();
    for (const bad of ["", "hello", text.slice(0, -1), text + "A", text.replace(/^./, "1")]) {
      expect(() => parseRecoveryKey(bad)).toThrow(RecoveryKeyFormatError);
    }
    // Non-canonical last character (spare bits set).
    expect(() => parseRecoveryKey("AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AB")).toThrow(
      RecoveryKeyFormatError
    );
  });
});

describe("recovery KEK (HKDF-SHA-256)", () => {
  it("wraps and unwraps the vault key", async () => {
    const { bytes } = generateRecoveryKey();
    const vaultKey = await generateVaultKey();
    const wrapped = await wrapVaultKey(vaultKey, await deriveRecoveryKek(bytes, USER));

    const kek = await deriveRecoveryKek(parseRecoveryKey(formatRecoveryKey(bytes)), USER);
    await expect(unwrapVaultKey(wrapped, kek)).resolves.toBeDefined();
  });

  it("fails with a wrong recovery key", async () => {
    const vaultKey = await generateVaultKey();
    const wrapped = await wrapVaultKey(
      vaultKey,
      await deriveRecoveryKek(generateRecoveryKey().bytes, USER)
    );
    const wrong = await deriveRecoveryKek(generateRecoveryKey().bytes, USER);
    await expect(unwrapVaultKey(wrapped, wrong)).rejects.toBeInstanceOf(VaultKeyUnwrapError);
  });

  it("is bound to the user: the same key can't open another user's wrap", async () => {
    const { bytes } = generateRecoveryKey();
    const wrapped = await wrapVaultKey(
      await generateVaultKey(),
      await deriveRecoveryKek(bytes, USER)
    );
    const otherUser = await deriveRecoveryKek(bytes, "cuser000000000000000000002");
    await expect(unwrapVaultKey(wrapped, otherUser)).rejects.toBeInstanceOf(VaultKeyUnwrapError);
  });

  it("is non-extractable and limited to wrapping", async () => {
    const kek = await deriveRecoveryKek(generateRecoveryKey().bytes, USER);
    expect(kek.extractable).toBe(false);
    expect([...kek.usages].sort()).toEqual(["unwrapKey", "wrapKey"]);
  });
});

describe("recovery KEK input checks", () => {
  it("refuses a recovery key of the wrong length", async () => {
    for (const length of [0, 15, 17, 32]) {
      await expect(deriveRecoveryKek(new Uint8Array(length), USER)).rejects.toBeInstanceOf(
        RecoveryKeyFormatError
      );
    }
  });
});
