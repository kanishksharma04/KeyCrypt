import { describe, expect, it } from "vitest";
import { operatorContact } from "../operator";

describe("operatorContact (OPERATOR_CONTACT)", () => {
  it("is unset when empty or missing, so pages show the placeholder", () => {
    expect(operatorContact(undefined)).toEqual({ kind: "unset" });
    expect(operatorContact("   ")).toEqual({ kind: "unset" });
  });

  it("links an email address or an https URL", () => {
    expect(operatorContact(" privacy@example.com ")).toEqual({
      kind: "email",
      value: "privacy@example.com",
      href: "mailto:privacy@example.com",
    });
    expect(operatorContact("https://example.com/contact")).toEqual({
      kind: "url",
      value: "https://example.com/contact",
      href: "https://example.com/contact",
    });
  });

  it("never links other schemes; shows them as text", () => {
    expect(operatorContact("javascript:alert(1)")).toEqual({
      kind: "text",
      value: "javascript:alert(1)",
    });
    expect(operatorContact("http://example.com")).toEqual({
      kind: "text",
      value: "http://example.com",
    });
    expect(operatorContact("Jane Doe, 1 Main St")).toEqual({
      kind: "text",
      value: "Jane Doe, 1 Main St",
    });
  });
});
