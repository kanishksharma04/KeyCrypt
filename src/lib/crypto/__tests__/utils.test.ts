import { describe, it, expect } from "vitest";
import { toBase64, fromBase64, bufferToBase64, stringToBytes, bytesToString } from "../utils";

describe("utils", () => {
  describe("toBase64 / fromBase64", () => {
    it("round-trips arbitrary bytes", () => {
      const original = new Uint8Array([0, 1, 127, 128, 255, 42, 13]);
      expect(fromBase64(toBase64(original))).toEqual(original);
    });

    it("round-trips empty array", () => {
      const empty = new Uint8Array(0);
      expect(fromBase64(toBase64(empty))).toEqual(empty);
    });

    it("round-trips 32 random bytes", () => {
      const bytes = new Uint8Array(32);
      globalThis.crypto.getRandomValues(bytes);
      expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    });

    it("toBase64 produces a non-empty string for non-empty input", () => {
      expect(toBase64(new Uint8Array([1, 2, 3]))).toBeTruthy();
    });
  });

  describe("bufferToBase64", () => {
    it("encodes an ArrayBuffer correctly", () => {
      const bytes = new Uint8Array([65, 66, 67]); // "ABC"
      const buffer = bytes.buffer;
      expect(bufferToBase64(buffer)).toBe(toBase64(bytes));
    });
  });

  describe("stringToBytes / bytesToString", () => {
    it("round-trips ASCII", () => {
      const s = "hello, world!";
      expect(bytesToString(stringToBytes(s))).toBe(s);
    });

    it("round-trips unicode / emoji", () => {
      const s = "🔐 KeyCrypt — zero knowledge";
      expect(bytesToString(stringToBytes(s))).toBe(s);
    });

    it("round-trips empty string", () => {
      expect(bytesToString(stringToBytes(""))).toBe("");
    });

    it("round-trips JSON payload", () => {
      const json = JSON.stringify({ username: "alice", password: "s3cr3t!" });
      expect(bytesToString(stringToBytes(json))).toBe(json);
    });
  });
});
