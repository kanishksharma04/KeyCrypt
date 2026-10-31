import { describe, expect, it } from "vitest";
import {
  decryptExport,
  encryptExport,
  ExportDecryptionError,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  fromBase64,
} from "../index";

const ITERATIONS = 1_000; // fast for tests; real exports use 600,000
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

describe("encrypted export", () => {
  it("round-trips the payload exactly", async () => {
    const file = await encryptExport(PAYLOAD, PASSWORD, ITERATIONS);
    // What the user downloads: JSON text, parsed back on import.
    const reparsed: unknown = JSON.parse(JSON.stringify(file));
    expect(await decryptExport(reparsed, PASSWORD)).toEqual(PAYLOAD);
  });

  it("produces the documented file format and nothing else", async () => {
    const file = await encryptExport(PAYLOAD, PASSWORD, ITERATIONS);
    expect(Object.keys(file).sort()).toEqual([
      "ciphertext",
      "format",
      "iv",
      "kdf",
      "salt",
      "version",
    ]);
    expect(file).toMatchObject({
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS },
    });
    expect(fromBase64(file.salt).byteLength).toBe(16);
    expect(fromBase64(file.iv).byteLength).toBe(12);
    // No plaintext leaks into the file.
    const text = JSON.stringify(file);
    for (const s of ["GitHub", "octocat", "p@ss", "line 1"]) expect(text).not.toContain(s);
  });

  it("defaults to 600,000 PBKDF2 iterations", async () => {
    const file = await encryptExport({ tiny: true }, PASSWORD);
    expect(file.kdf.iterations).toBe(600_000);
  });

  it("uses a fresh salt and IV every time", async () => {
    const a = await encryptExport(PAYLOAD, PASSWORD, ITERATIONS);
    const b = await encryptExport(PAYLOAD, PASSWORD, ITERATIONS);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rejects a wrong export password", async () => {
    const file = await encryptExport(PAYLOAD, PASSWORD, ITERATIONS);
    await expect(decryptExport(file, "Wrong-Pass-456!")).rejects.toBeInstanceOf(
      ExportDecryptionError
    );
  });

  it("rejects a tampered ciphertext", async () => {
    const file = await encryptExport(PAYLOAD, PASSWORD, ITERATIONS);
    const bytes = fromBase64(file.ciphertext);
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    const tampered = { ...file, ciphertext: btoa(String.fromCharCode(...bytes)) };
    await expect(decryptExport(tampered, PASSWORD)).rejects.toBeInstanceOf(ExportDecryptionError);
  });

  it("rejects files that are not KeyCrypt exports", async () => {
    const good = await encryptExport(PAYLOAD, PASSWORD, ITERATIONS);
    const bad: unknown[] = [
      null,
      "text",
      { ...good, format: "other" },
      { ...good, version: 2 },
      { ...good, kdf: { ...good.kdf, iterations: 0 } },
      { ...good, kdf: { ...good.kdf, iterations: 1e12 } }, // would stall the browser
      { ...good, salt: "AAAA" }, // wrong length
    ];
    for (const file of bad) {
      await expect(decryptExport(file, PASSWORD)).rejects.toBeInstanceOf(ExportDecryptionError);
    }
  });
});
