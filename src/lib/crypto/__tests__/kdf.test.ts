import { describe, expect, it } from "vitest";
import { hashRaw, type Algorithm } from "@node-rs/argon2";

// @node-rs/argon2 exposes Algorithm as an ambient const enum (unusable with isolatedModules).
const ARGON2ID = 2 as Algorithm;
import {
  DEFAULT_ARGON2ID_PARAMS,
  deriveKek,
  generateSalt,
  generateVaultKey,
  KdfConfigError,
  parseKdfConfig,
  unwrapVaultKey,
  VaultKeyUnwrapError,
  wrapVaultKey,
} from "../index";
import type { KdfConfig } from "../index";

const FAST: KdfConfig = {
  kdf: "argon2id",
  params: { memoryKiB: 8_192, iterations: 1, parallelism: 1, hashLength: 32 },
};

describe("parseKdfConfig", () => {
  it("accepts the default Argon2id settings", () => {
    expect(parseKdfConfig("argon2id", DEFAULT_ARGON2ID_PARAMS)).toEqual({
      kdf: "argon2id",
      params: { memoryKiB: 65_536, iterations: 3, parallelism: 1, hashLength: 32 },
    });
  });

  it("rejects Argon2id settings a hostile server could use to hang or crash the browser", () => {
    const bad = [
      { ...DEFAULT_ARGON2ID_PARAMS, memoryKiB: 4_194_304 }, // 4 GiB
      { ...DEFAULT_ARGON2ID_PARAMS, memoryKiB: 1_024 }, // too weak
      { ...DEFAULT_ARGON2ID_PARAMS, iterations: 1_000 },
      { ...DEFAULT_ARGON2ID_PARAMS, parallelism: 64 },
      { ...DEFAULT_ARGON2ID_PARAMS, hashLength: 64 },
      { ...DEFAULT_ARGON2ID_PARAMS, iterations: 2.5 },
      null,
      "64MiB",
    ];
    for (const params of bad)
      expect(() => parseKdfConfig("argon2id", params)).toThrow(KdfConfigError);
  });

  it("reads older PBKDF2 rows, defaulting to 600,000 iterations", () => {
    expect(parseKdfConfig("pbkdf2", null)).toEqual({
      kdf: "pbkdf2",
      params: { iterations: 600_000, hash: "SHA-256" },
    });
    expect(() => parseKdfConfig("pbkdf2", { iterations: 1_000, hash: "SHA-256" })).toThrow(
      KdfConfigError
    );
  });

  it("rejects unknown KDFs", () => {
    expect(() => parseKdfConfig("scrypt", {})).toThrow(KdfConfigError);
  });
});

describe("parseKdfConfig for legacy PBKDF2 vaults", () => {
  it("accepts recorded parameters within bounds and defaults missing ones to 600,000", () => {
    expect(parseKdfConfig("pbkdf2", { iterations: 600_000, hash: "SHA-256" })).toEqual({
      kdf: "pbkdf2",
      params: { iterations: 600_000, hash: "SHA-256" },
    });
    expect(parseKdfConfig("pbkdf2", null)).toEqual({
      kdf: "pbkdf2",
      params: { iterations: 600_000, hash: "SHA-256" },
    });
  });

  it("rejects PBKDF2 parameters a hostile server could use to weaken or stall unlocking", () => {
    for (const params of [
      { iterations: 1_000, hash: "SHA-256" }, // too weak
      { iterations: 100_000_000, hash: "SHA-256" }, // would stall the browser
      { iterations: 600_000, hash: "SHA-1" },
      { iterations: "600000", hash: "SHA-256" },
    ]) {
      expect(() => parseKdfConfig("pbkdf2", params)).toThrow(KdfConfigError);
    }
  });
});

describe("deriveKek with Argon2id", () => {
  it("matches an independent Argon2id implementation (@node-rs/argon2)", async () => {
    const password = "Master-Pass-1!";
    const salt = generateSalt();

    // Wrap with the KEK from our hash-wasm path…
    const ours = await deriveKek(password, salt, FAST);
    const vaultKey = await generateVaultKey();
    const wrapped = await wrapVaultKey(vaultKey, ours);

    // …and unwrap with a KEK built from the native implementation's raw output.
    const raw = await hashRaw(password, {
      algorithm: ARGON2ID,
      salt: Buffer.from(salt),
      memoryCost: FAST.kdf === "argon2id" ? FAST.params.memoryKiB : 0,
      timeCost: 1,
      parallelism: 1,
      outputLen: 32,
    });
    const native = await globalThis.crypto.subtle.importKey(
      "raw",
      new Uint8Array(raw),
      { name: "AES-GCM", length: 256 },
      false,
      ["wrapKey", "unwrapKey"]
    );
    await expect(unwrapVaultKey(wrapped, native)).resolves.toBeDefined();
  });

  it("depends on the password, the salt and the parameters", async () => {
    const salt = generateSalt();
    const kek = await deriveKek("Master-Pass-1!", salt, FAST);
    const wrapped = await wrapVaultKey(await generateVaultKey(), kek);

    const variants: [string, Uint8Array<ArrayBuffer>, KdfConfig][] = [
      ["Master-Pass-2!", salt, FAST],
      ["Master-Pass-1!", generateSalt(), FAST],
      ["Master-Pass-1!", salt, { ...FAST, params: { ...FAST.params, iterations: 2 } } as KdfConfig],
    ];
    for (const [pw, s, cfg] of variants) {
      const other = await deriveKek(pw, s, cfg);
      await expect(unwrapVaultKey(wrapped, other)).rejects.toBeInstanceOf(VaultKeyUnwrapError);
    }
    // The same inputs re-derive the same key.
    await expect(
      unwrapVaultKey(wrapped, await deriveKek("Master-Pass-1!", salt, FAST))
    ).resolves.toBeDefined();
  });

  it("produces a non-extractable key limited to wrapping", async () => {
    const kek = await deriveKek("Master-Pass-1!", generateSalt(), FAST);
    expect(kek.extractable).toBe(false);
    expect([...kek.usages].sort()).toEqual(["unwrapKey", "wrapKey"]);
  });

  it("still derives PBKDF2 KEKs for older rows", async () => {
    const salt = generateSalt();
    const cfg: KdfConfig = { kdf: "pbkdf2", params: { iterations: 100_000, hash: "SHA-256" } };
    const kek = await deriveKek("Master-Pass-1!", salt, cfg);
    const wrapped = await wrapVaultKey(await generateVaultKey(), kek);
    await expect(
      unwrapVaultKey(wrapped, await deriveKek("Master-Pass-1!", salt, cfg))
    ).resolves.toBeDefined();
  });
});
