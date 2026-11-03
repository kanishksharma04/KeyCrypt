import { describe, expect, it } from "vitest";
import { fillableTabHost, loginMatchesTab, savedHost } from "./match";

describe("savedHost", () => {
  it.each([
    ["https://github.com/login", "github.com"],
    ["github.com", "github.com"],
    ["https://WWW.Example.com:8443/x", "example.com"],
    ["http://127.0.0.1:4599/login", "127.0.0.1"],
    ["", null],
    ["ftp://files.example.com", null],
    ["not a url at all", null],
  ])("%j → %j", (url, host) => {
    expect(savedHost(url)).toBe(host);
  });
});

describe("fillableTabHost", () => {
  it("allows https pages and local http only", () => {
    expect(fillableTabHost("https://accounts.google.com/signin")).toBe("accounts.google.com");
    expect(fillableTabHost("http://localhost:3000/")).toBe("localhost");
    expect(fillableTabHost("http://127.0.0.1:4599/login")).toBe("127.0.0.1");
    expect(fillableTabHost("http://example.com/login")).toBeNull();
    expect(fillableTabHost("chrome://extensions")).toBeNull();
    expect(fillableTabHost(undefined)).toBeNull();
  });
});

describe("loginMatchesTab", () => {
  it.each([
    ["https://example.com", "https://example.com/login", true],
    ["example.com", "https://login.example.com/", true],
    ["https://www.example.com", "https://example.com/", true],
    ["https://example.com", "https://www.example.com/", true],
    ["https://login.example.com", "https://example.com/", false],
    ["https://example.com", "https://evil-example.com/", false],
    ["https://example.com", "https://example.com.evil.net/", false],
    ["https://example.com", "http://example.com/", false],
    ["http://127.0.0.1:4599/login", "http://127.0.0.1:4599/login", true],
    ["", "https://example.com/", false],
  ])("saved %j on tab %j → %s", (saved, tab, expected) => {
    expect(loginMatchesTab(saved, tab)).toBe(expected);
  });
});
