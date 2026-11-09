import { describe, expect, it } from "vitest";
import {
  decryptExport,
  deriveVaultKey,
  encryptExport,
  encryptItem,
  ExportDecryptionError,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  fromBase64,
  generateSalt,
  KDF_LIMITS,
  toBase64,
  type Argon2idParams,
  type EncryptedExportFileV1,
} from "../index";

// Fast Argon2id settings for tests (the lowest memory KDF_LIMITS allows);
// real exports use the vault's 64 MiB / 3 iterations / parallelism 1.
const FAST: Argon2idParams = { memoryKiB: 8_192, iterations: 1, parallelism: 1, hashLength: 32 };
const PASSWORD = "Export-Pass-123!";

const PAYLOAD = {
  exportedAt: "2026-10-31T22:16:00.000Z",
  items: [
    {
      type: "LOGIN",
      name: "GitHub",
      favorite: true,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
      secret: {
        username: "octocat",
        password: 'p@ss,"quoted"\nnewline',
        url: "https://github.com",
        notes: "",
      },
    },
    {
      type: "SECURE_NOTE",
      name: "Notes ünïcødé 🔐",
      favorite: false,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      secret: { content: "line 1\nline 2" },
    },
  ],
};

/** A v1 file as KeyCrypt wrote it before 2026-11-09 (PBKDF2-SHA-256). */
async function makeV1Export(
  payload: unknown,
  password: string,
  iterations = 1_000
): Promise<EncryptedExportFileV1> {
  const salt = generateSalt();
  const key = await deriveVaultKey(password, salt, iterations);
  const { ciphertext, iv } = await encryptItem(key, payload);
  return {
    format: EXPORT_FORMAT,
    version: 1,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations },
    salt: toBase64(salt),
    iv,
    ciphertext,
  };
}

/** What the user downloads is JSON text, parsed back on import. */
const viaJson = (file: unknown): unknown => JSON.parse(JSON.stringify(file));

describe("encrypted export v2 (Argon2id)", () => {
  it("round-trips the payload exactly", async () => {
    const file = await encryptExport(PAYLOAD, PASSWORD, FAST);
    expect(await decryptExport(viaJson(file), PASSWORD)).toEqual(PAYLOAD);
  });

  it("produces the documented file format and nothing else", async () => {
    const file = await encryptExport(PAYLOAD, PASSWORD, FAST);
    expect(EXPORT_VERSION).toBe(2);
    expect(Object.keys(file).sort()).toEqual([
      "ciphertext",
      "format",
      "iv",
      "kdf",
      "salt",
      "version",
    ]);
    expect(file).toEqual({
      format: EXPORT_FORMAT,
      version: 2,
      kdf: { name: "argon2id", memoryKiB: 8_192, iterations: 1, parallelism: 1 },
      salt: expect.any(String),
      iv: expect.any(String),
      ciphertext: expect.any(String),
    });
    expect(fromBase64(file.salt).byteLength).toBe(16);
    expect(fromBase64(file.iv).byteLength).toBe(12);
    // No plaintext leaks into the file.
    const text = JSON.stringify(file);
    for (const s of ["GitHub", "octocat", "p@ss", "line 1"]) expect(text).not.toContain(s);
  });

  it("defaults to the vault's Argon2id parameters (64 MiB, 3 iterations, parallelism 1)", async () => {
    const file = await encryptExport({ tiny: true }, PASSWORD);
    expect(file.kdf).toEqual({
      name: "argon2id",
      memoryKiB: 65_536,
      iterations: 3,
      parallelism: 1,
    });
    expect(await decryptExport(viaJson(file), PASSWORD)).toEqual({ tiny: true });
  });

  it("uses a fresh salt and IV every time", async () => {
    const a = await encryptExport(PAYLOAD, PASSWORD, FAST);
    const b = await encryptExport(PAYLOAD, PASSWORD, FAST);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rejects a wrong export password", async () => {
    const file = await encryptExport(PAYLOAD, PASSWORD, FAST);
    await expect(decryptExport(file, "Wrong-Pass-456!")).rejects.toBeInstanceOf(
      ExportDecryptionError
    );
  });

  it("rejects a tampered ciphertext", async () => {
    const file = await encryptExport(PAYLOAD, PASSWORD, FAST);
    const bytes = fromBase64(file.ciphertext);
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    const tampered = { ...file, ciphertext: btoa(String.fromCharCode(...bytes)) };
    await expect(decryptExport(tampered, PASSWORD)).rejects.toBeInstanceOf(ExportDecryptionError);
  });

  it("rejects out-of-bounds Argon2id parameters before deriving anything", async () => {
    const good = await encryptExport(PAYLOAD, PASSWORD, FAST);
    const [minMem, maxMem] = KDF_LIMITS.argon2id.memoryKiB;
    const [minIt, maxIt] = KDF_LIMITS.argon2id.iterations;
    const [minPar, maxPar] = KDF_LIMITS.argon2id.parallelism;
    const kdfs: unknown[] = [
      { ...good.kdf, memoryKiB: maxMem + 1 }, // would exhaust memory
      { ...good.kdf, memoryKiB: 64 * 1_048_576 },
      { ...good.kdf, memoryKiB: minMem - 1 }, // too weak
      { ...good.kdf, iterations: maxIt + 1 }, // would stall the browser
      { ...good.kdf, iterations: minIt - 1 },
      { ...good.kdf, iterations: 1.5 },
      { ...good.kdf, parallelism: maxPar + 1 },
      { ...good.kdf, parallelism: minPar - 1 },
      { ...good.kdf, memoryKiB: "65536" },
      { name: "argon2id" },
      { ...good.kdf, name: "PBKDF2" }, // v2 must be Argon2id
      { name: "PBKDF2", hash: "SHA-256", iterations: 600_000 },
    ];
    for (const kdf of kdfs) {
      // Deriving with the oversized settings would take far longer than the test timeout.
      await expect(decryptExport({ ...good, kdf }, PASSWORD)).rejects.toThrow(
        ExportDecryptionError
      );
    }
  });

  it("refuses to write a file with out-of-bounds parameters", async () => {
    await expect(
      encryptExport(PAYLOAD, PASSWORD, { ...FAST, memoryKiB: 1_024 })
    ).rejects.toBeInstanceOf(ExportDecryptionError);
  });
});

describe("encrypted export v1 (PBKDF2, read only)", () => {
  it("still imports a v1 file", async () => {
    const file = await makeV1Export(PAYLOAD, PASSWORD);
    expect(await decryptExport(viaJson(file), PASSWORD)).toEqual(PAYLOAD);
  });

  it("rejects a wrong password on a v1 file", async () => {
    const file = await makeV1Export(PAYLOAD, PASSWORD);
    await expect(decryptExport(file, "Wrong-Pass-456!")).rejects.toBeInstanceOf(
      ExportDecryptionError
    );
  });

  it("rejects v1 files with unsupported or extreme KDF settings", async () => {
    const good = await makeV1Export(PAYLOAD, PASSWORD);
    const bad: unknown[] = [
      { ...good, kdf: { ...good.kdf, iterations: 0 } },
      { ...good, kdf: { ...good.kdf, iterations: 1e12 } }, // would stall the browser
      { ...good, kdf: { ...good.kdf, hash: "SHA-1" } },
      { ...good, kdf: { name: "argon2id", memoryKiB: 8_192, iterations: 1, parallelism: 1 } },
    ];
    for (const file of bad) {
      await expect(decryptExport(file, PASSWORD)).rejects.toBeInstanceOf(ExportDecryptionError);
    }
  });
});

describe("export file validation", () => {
  it("rejects files that are not KeyCrypt exports", async () => {
    const good = await encryptExport(PAYLOAD, PASSWORD, FAST);
    const bad: unknown[] = [
      null,
      "text",
      { ...good, format: "other" },
      { ...good, version: 3 },
      { ...good, version: "2" },
      { ...good, kdf: undefined },
      { ...good, salt: "AAAA" }, // wrong length
      { ...good, iv: "AAAA" },
    ];
    for (const file of bad) {
      await expect(decryptExport(file, PASSWORD)).rejects.toBeInstanceOf(ExportDecryptionError);
    }
  });
});
