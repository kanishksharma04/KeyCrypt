import { describe, it, expect, beforeAll } from "vitest";
import { deriveVaultKey, SALT_LENGTH } from "../key-derivation";
import { createVerificationBlob, verifyVaultKey } from "../verification";

const TEST_ITERATIONS = 1;
const SALT = new Uint8Array(SALT_LENGTH).fill(99);

let correctKey: CryptoKey;
let wrongKey: CryptoKey;

beforeAll(async () => {
  correctKey = await deriveVaultKey("correct-master!1A", SALT, TEST_ITERATIONS);
  wrongKey = await deriveVaultKey("wrong-master!1A", SALT, TEST_ITERATIONS);
});

describe("createVerificationBlob", () => {
  it("returns an EncryptedPayload with ciphertext and iv", async () => {
    const blob = await createVerificationBlob(correctKey);
    expect(typeof blob.ciphertext).toBe("string");
    expect(typeof blob.iv).toBe("string");
    expect(blob.ciphertext.length).toBeGreaterThan(0);
    expect(blob.iv.length).toBeGreaterThan(0);
  });

  it("produces unique blobs on each call (random IV)", async () => {
    const b1 = await createVerificationBlob(correctKey);
    const b2 = await createVerificationBlob(correctKey);
    expect(b1.iv).not.toBe(b2.iv);
    expect(b1.ciphertext).not.toBe(b2.ciphertext);
  });
});

describe("verifyVaultKey", () => {
  it("returns true for the correct key", async () => {
    const blob = await createVerificationBlob(correctKey);
    expect(await verifyVaultKey(correctKey, blob)).toBe(true);
  });

  it("returns false for a wrong key", async () => {
    const blob = await createVerificationBlob(correctKey);
    expect(await verifyVaultKey(wrongKey, blob)).toBe(false);
  });

  it("returns false for a tampered ciphertext", async () => {
    const blob = await createVerificationBlob(correctKey);
    const bytes = Uint8Array.from(atob(blob.ciphertext), (c) => c.charCodeAt(0));
    bytes[0] = bytes[0]! ^ 0xff;
    const tampered = {
      ciphertext: btoa(String.fromCharCode(...bytes)),
      iv: blob.iv,
    };
    expect(await verifyVaultKey(correctKey, tampered)).toBe(false);
  });

  it("returns false for a tampered IV", async () => {
    const blob = await createVerificationBlob(correctKey);
    const ivBytes = new Uint8Array(12).fill(0xde);
    const tampered = {
      ciphertext: blob.ciphertext,
      iv: btoa(String.fromCharCode(...ivBytes)),
    };
    expect(await verifyVaultKey(correctKey, tampered)).toBe(false);
  });

  it("never throws — always returns a boolean", async () => {
    // Even a completely garbage blob should not throw
    const garbage = { ciphertext: btoa("garbage"), iv: btoa("nonce") };
    await expect(verifyVaultKey(correctKey, garbage)).resolves.toBe(false);
  });
});
