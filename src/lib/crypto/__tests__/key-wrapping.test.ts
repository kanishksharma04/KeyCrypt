import { describe, expect, it } from "vitest";
import {
  decryptItem,
  deriveKek,
  encryptItem,
  fromBase64,
  generateSalt,
  generateVaultKey,
  unwrapVaultKey,
  VaultKeyUnwrapError,
  wrapVaultKey,
} from "../index";

const ITERATIONS = 1_000; // fast for tests

async function setup(password = "Master-Pass-1!") {
  const salt = generateSalt();
  const kek = await deriveKek(password, salt, ITERATIONS);
  const vaultKey = await generateVaultKey();
  const wrapped = await wrapVaultKey(vaultKey, kek);
  return { salt, kek, vaultKey, wrapped };
}

describe("vault key wrapping", () => {
  it("round-trips: the unwrapped key decrypts what the original encrypted", async () => {
    const { kek, vaultKey, wrapped } = await setup();
    const payload = await encryptItem(vaultKey, { secret: "s3cret" });

    const unwrapped = await unwrapVaultKey(wrapped, kek);
    expect(await decryptItem(unwrapped, payload)).toEqual({ secret: "s3cret" });
  });

  it("re-derives the same KEK from the same password and salt", async () => {
    const { salt, vaultKey, wrapped } = await setup("Master-Pass-1!");
    const kekAgain = await deriveKek("Master-Pass-1!", salt, ITERATIONS);
    const unwrapped = await unwrapVaultKey(wrapped, kekAgain);
    const payload = await encryptItem(unwrapped, "x");
    expect(await decryptItem(vaultKey, payload)).toBe("x");
  });

  it("fails with a wrong master password", async () => {
    const { salt, wrapped } = await setup("Master-Pass-1!");
    const wrongKek = await deriveKek("Wrong-Pass-2!", salt, ITERATIONS);
    await expect(unwrapVaultKey(wrapped, wrongKek)).rejects.toBeInstanceOf(VaultKeyUnwrapError);
  });

  it("fails if the wrapped key or its IV was tampered with", async () => {
    const { kek, wrapped } = await setup();
    const bytes = fromBase64(wrapped.wrappedKey);
    bytes[0] = (bytes[0] ?? 0) ^ 0x01;
    const tampered = { ...wrapped, wrappedKey: btoa(String.fromCharCode(...bytes)) };
    await expect(unwrapVaultKey(tampered, kek)).rejects.toBeInstanceOf(VaultKeyUnwrapError);
    await expect(
      unwrapVaultKey({ ...wrapped, iv: "AAAAAAAAAAAAAAAA" }, kek)
    ).rejects.toBeInstanceOf(VaultKeyUnwrapError);
  });

  it("unwraps a NON-extractable key by default", async () => {
    const { kek, wrapped } = await setup();
    const key = await unwrapVaultKey(wrapped, kek);
    expect(key.extractable).toBe(false);
    expect(key.usages.sort()).toEqual(["decrypt", "encrypt"]);
    await expect(globalThis.crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });

  it("can unwrap a short-lived extractable copy for re-wrapping", async () => {
    const { kek, wrapped } = await setup();
    const copy = await unwrapVaultKey(wrapped, kek, { extractable: true });
    const newKek = await deriveKek("New-Master-Pass-3!", generateSalt(), ITERATIONS);
    const rewrapped = await wrapVaultKey(copy, newKek);
    await expect(unwrapVaultKey(rewrapped, newKek)).resolves.toBeDefined();
  });

  it("keeps the KEK limited to wrapping", async () => {
    const { kek } = await setup();
    expect(kek.extractable).toBe(false);
    expect(kek.usages.sort()).toEqual(["unwrapKey", "wrapKey"]);
    await expect(encryptItem(kek, "data")).rejects.toThrow();
  });

  it("uses a fresh IV for every wrap", async () => {
    const { kek, vaultKey } = await setup();
    const a = await wrapVaultKey(vaultKey, kek);
    const b = await wrapVaultKey(vaultKey, kek);
    expect(a.iv).not.toBe(b.iv);
    expect(fromBase64(a.iv).byteLength).toBe(12);
  });
});
