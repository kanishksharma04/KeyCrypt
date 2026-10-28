import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientIp } from "../client-ip";

function h(init: Record<string, string>): Headers {
  return new Headers(init);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getClientIp: default header order", () => {
  it("prefers x-vercel-forwarded-for over every other header", () => {
    const headers = h({
      "x-vercel-forwarded-for": "203.0.113.10",
      "x-real-ip": "198.51.100.20",
      "x-forwarded-for": "192.0.2.30",
    });
    expect(getClientIp(headers)).toBe("203.0.113.10");
  });

  it("falls back to x-real-ip when the Vercel header is absent", () => {
    const headers = h({ "x-real-ip": "198.51.100.20", "x-forwarded-for": "192.0.2.30" });
    expect(getClientIp(headers)).toBe("198.51.100.20");
  });

  it("falls back to the rightmost x-forwarded-for entry", () => {
    const headers = h({ "x-forwarded-for": "192.0.2.1, 192.0.2.2, 192.0.2.30" });
    expect(getClientIp(headers)).toBe("192.0.2.30");
  });

  it('returns "unknown" when no IP header is present', () => {
    expect(getClientIp(h({}))).toBe("unknown");
  });

  it("ignores empty and whitespace-only values", () => {
    const headers = h({
      "x-vercel-forwarded-for": "  ",
      "x-real-ip": "",
      "x-forwarded-for": "192.0.2.30, ",
    });
    expect(getClientIp(headers)).toBe("192.0.2.30");
  });
});

describe("getClientIp: spoofing", () => {
  it("ignores a spoofed leading x-forwarded-for value", () => {
    // The client sent "X-Forwarded-For: 6.6.6.6"; the proxy appended the real address.
    const headers = h({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" });
    expect(getClientIp(headers)).toBe("203.0.113.7");
  });

  it("returns the same IP however the spoofed leading value is rotated", () => {
    const a = getClientIp(h({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }));
    const b = getClientIp(h({ "x-forwarded-for": "2.2.2.2, 203.0.113.7" }));
    // Rotating the spoofed value must not create a fresh rate-limit bucket.
    expect(a).toBe(b);
  });

  it("does not let x-forwarded-for override a trusted header", () => {
    const headers = h({ "x-real-ip": "198.51.100.20", "x-forwarded-for": "6.6.6.6" });
    expect(getClientIp(headers)).toBe("198.51.100.20");
  });
});

describe("getClientIp: TRUSTED_IP_HEADER override", () => {
  it("uses only the configured header", () => {
    vi.stubEnv("TRUSTED_IP_HEADER", "CF-Connecting-IP");
    const headers = h({
      "cf-connecting-ip": "203.0.113.99",
      "x-vercel-forwarded-for": "203.0.113.10",
      "x-real-ip": "198.51.100.20",
    });
    expect(getClientIp(headers)).toBe("203.0.113.99");
  });

  it('returns "unknown" rather than trusting other headers when it is missing', () => {
    vi.stubEnv("TRUSTED_IP_HEADER", "cf-connecting-ip");
    const headers = h({ "x-real-ip": "198.51.100.20", "x-forwarded-for": "6.6.6.6" });
    expect(getClientIp(headers)).toBe("unknown");
  });

  it("still takes the rightmost entry when the override is x-forwarded-for", () => {
    vi.stubEnv("TRUSTED_IP_HEADER", "x-forwarded-for");
    const headers = h({ "x-forwarded-for": "6.6.6.6, 203.0.113.7", "x-real-ip": "198.51.100.20" });
    expect(getClientIp(headers)).toBe("203.0.113.7");
  });

  it("is ignored when blank", () => {
    vi.stubEnv("TRUSTED_IP_HEADER", "  ");
    expect(getClientIp(h({ "x-real-ip": "198.51.100.20" }))).toBe("198.51.100.20");
  });
});

describe("getClientIp: input types", () => {
  it("accepts the headers of a Request (as Auth.js authorize() receives)", () => {
    const req = new Request("https://keycrypt.test/api/auth/callback/credentials", {
      method: "POST",
      headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.7" },
    });
    expect(getClientIp(req.headers)).toBe("203.0.113.7");
  });
});
