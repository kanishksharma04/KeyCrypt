import { describe, expect, it } from "vitest";
import { generateIv, generateSalt, toBase64 } from "@/lib/crypto";
import {
  ciphertextSchema,
  idSchema,
  itemNameSchema,
  ivSchema,
  saltSchema,
  tokenSchema,
} from "../server";

describe("server input schemas", () => {
  it("accepts IVs and salts exactly as the client encodes them", () => {
    expect(ivSchema.safeParse(toBase64(generateIv())).success).toBe(true);
    expect(saltSchema.safeParse(toBase64(generateSalt())).success).toBe(true);
  });

  it("rejects non-base64 and wrong lengths", () => {
    expect(ivSchema.safeParse("AAAAAAAAAAAAAAA=").success).toBe(true); // 16 chars, valid padding
    expect(ivSchema.safeParse("AAAAAAAAAAAAAAA").success).toBe(false); // 15
    expect(ivSchema.safeParse("AAAAAAAAAAAAAA-_").success).toBe(false); // base64url chars
    expect(ciphertextSchema.safeParse("abc").success).toBe(false); // not a multiple of 4
    expect(ciphertextSchema.safeParse("ab=c").success).toBe(false); // padding in the middle
  });

  it("caps ciphertext at 200,000 characters", () => {
    expect(ciphertextSchema.safeParse("A".repeat(200_000)).success).toBe(true);
    expect(ciphertextSchema.safeParse("A".repeat(200_004)).success).toBe(false);
  });

  it("trims names and enforces 1 to 100 characters", () => {
    expect(itemNameSchema.parse("  GitHub  ")).toBe("GitHub");
    expect(itemNameSchema.safeParse("   ").success).toBe(false);
    expect(itemNameSchema.safeParse("x".repeat(101)).success).toBe(false);
  });

  it("accepts cuid ids and 64-hex tokens only", () => {
    expect(idSchema.safeParse("clx1y2z3a0000abcdefghijkl").success).toBe(true);
    expect(idSchema.safeParse("not-an-id").success).toBe(false);
    expect(tokenSchema.safeParse("a".repeat(64)).success).toBe(true);
    expect(tokenSchema.safeParse("A".repeat(64)).success).toBe(false);
    expect(tokenSchema.safeParse("a".repeat(63)).success).toBe(false);
  });
});
