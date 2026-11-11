import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32, createZip } from "../scripts/zip.mjs";

/** Reads a zip's entries back through its central directory. */
function readZip(zip: Buffer): Map<string, Buffer> {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  const count = zip.readUInt16LE(end + 10);
  let p = zip.readUInt32LE(end + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(p)).toBe(0x02014b50);
    const compressedSize = zip.readUInt32LE(p + 20);
    const size = zip.readUInt32LE(p + 24);
    const nameLength = zip.readUInt16LE(p + 28);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLength).toString("utf8");
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const dataStart = localOffset + 30 + localNameLength;
    const data = inflateRawSync(zip.subarray(dataStart, dataStart + compressedSize));
    expect(data.length).toBe(size);
    expect(crc32(data)).toBe(zip.readUInt32LE(p + 16));
    out.set(name, data);
    p += 46 + nameLength;
  }
  return out;
}

describe("createZip", () => {
  it("round-trips files, with forward-slash paths", () => {
    const files = [
      { name: "manifest.json", data: Buffer.from('{"manifest_version":3}') },
      { name: "icons/icon-16.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]) },
      { name: "assets/popup.js", data: Buffer.from("x".repeat(10_000)) },
    ];
    const entries = readZip(createZip(files));
    expect([...entries.keys()].sort()).toEqual(files.map((f) => f.name).sort());
    for (const f of files) expect(entries.get(f.name)?.equals(f.data)).toBe(true);
  });

  it("is deterministic", () => {
    const files = [{ name: "a.txt", data: Buffer.from("hello") }];
    expect(createZip(files).equals(createZip([...files]))).toBe(true);
  });

  it("computes the standard CRC-32", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });
});
