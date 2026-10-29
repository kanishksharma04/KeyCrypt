import { describe, expect, it } from "vitest";
import { hmacSign, hmacVerify } from "../index";

const SECRET = "test-secret-0123456789abcdefghijklmnop";

describe("hmacSign / hmacVerify", () => {
  it("matches the RFC 4231 test case 2 vector", async () => {
    // key = "Jefe", data = "what do ya want for nothing?"
    const sig = await hmacSign("Jefe", "what do ya want for nothing?");
    const hex = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("hex");
    expect(hex).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  });

  it("produces unpadded base64url", async () => {
    const sig = await hmacSign(SECRET, "message");
    expect(sig).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("verifies its own signatures", async () => {
    const sig = await hmacSign(SECRET, "message");
    expect(await hmacVerify(SECRET, "message", sig)).toBe(true);
  });

  it("rejects a changed message, a wrong secret or a tampered signature", async () => {
    const sig = await hmacSign(SECRET, "message");
    expect(await hmacVerify(SECRET, "messagE", sig)).toBe(false);
    expect(await hmacVerify(SECRET + "x", "message", sig)).toBe(false);
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(await hmacVerify(SECRET, "message", flipped)).toBe(false);
  });

  it("returns false for malformed signatures instead of throwing", async () => {
    for (const bad of ["", "not base64!", "abc", "A".repeat(100)]) {
      expect(await hmacVerify(SECRET, "message", bad)).toBe(false);
    }
  });
});
