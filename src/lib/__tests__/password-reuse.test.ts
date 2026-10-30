import { describe, expect, it } from "vitest";
import { isSameAsAccountPassword, PASSWORD_REUSE_ERROR } from "../password-reuse";

describe("isSameAsAccountPassword", () => {
  it("detects an identical password", () => {
    expect(isSameAsAccountPassword("Correct-Horse-9!", "Correct-Horse-9!")).toBe(true);
  });

  it("allows a different password", () => {
    expect(isSameAsAccountPassword("Correct-Horse-9!", "Battery-Staple-7?")).toBe(false);
  });

  it("treats case and whitespace as significant, like sign-in does", () => {
    expect(isSameAsAccountPassword("Correct-Horse-9!", "correct-horse-9!")).toBe(false);
    expect(isSameAsAccountPassword("Correct-Horse-9! ", "Correct-Horse-9!")).toBe(false);
  });

  it("matches the same text in different Unicode forms", () => {
    const composed = "Café-Passw0rd!"; // é as one code point
    const decomposed = "Café-Passw0rd!"; // e + combining acute
    expect(composed).not.toBe(decomposed);
    expect(isSameAsAccountPassword(composed, decomposed)).toBe(true);
  });

  it("uses the agreed message", () => {
    expect(PASSWORD_REUSE_ERROR).toBe("Use a different password from your account password.");
  });
});
