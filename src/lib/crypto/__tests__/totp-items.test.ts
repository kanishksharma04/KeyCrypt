import { createHmac, randomBytes } from "crypto";
import { describe, expect, it } from "vitest";
import {
  currentTotpCode,
  parseTotpInput,
  totpParamsToUri,
  TotpParseError,
  type TotpAlgorithm,
  type TotpParams,
} from "@/lib/crypto";

// Authenticator codes for vault items must match what any RFC 6238
// authenticator shows for the same secret.

/** RFC 4648 base32 (no padding), written independently of otpauth. */
function base32(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

/** Reference TOTP (RFC 6238 / RFC 4226) on Node's HMAC. */
function referenceTotp(
  key: Buffer,
  unixSeconds: number,
  algorithm: TotpAlgorithm,
  digits: number,
  period: number
): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(unixSeconds / period)));
  const hmac = createHmac(algorithm.toLowerCase(), key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

const params = (secret: string, extra: Partial<TotpParams> = {}): TotpParams => ({
  secret,
  issuer: "",
  account: "",
  algorithm: "SHA1",
  digits: 6,
  period: 30,
  ...extra,
});

describe("currentTotpCode", () => {
  // RFC 6238 Appendix B (8 digits, 30 s).
  const KEYS: Record<TotpAlgorithm, Buffer> = {
    SHA1: Buffer.from("12345678901234567890"),
    SHA256: Buffer.from("12345678901234567890123456789012"),
    SHA512: Buffer.from("1234567890".repeat(6) + "1234"),
  };
  const VECTORS: Array<[number, Record<TotpAlgorithm, string>]> = [
    [59, { SHA1: "94287082", SHA256: "46119246", SHA512: "90693936" }],
    [1111111109, { SHA1: "07081804", SHA256: "68084774", SHA512: "25091201" }],
    [1111111111, { SHA1: "14050471", SHA256: "67062674", SHA512: "99943326" }],
    [1234567890, { SHA1: "89005924", SHA256: "91819424", SHA512: "93441116" }],
    [2000000000, { SHA1: "69279037", SHA256: "90698825", SHA512: "38618901" }],
    [20000000000, { SHA1: "65353130", SHA256: "77737706", SHA512: "47863826" }],
  ];

  it.each(VECTORS)("matches the RFC 6238 test vectors at T=%i", (t, expected) => {
    for (const algorithm of ["SHA1", "SHA256", "SHA512"] as const) {
      const p = params(base32(KEYS[algorithm]), { algorithm, digits: 8 });
      expect(currentTotpCode(p, t * 1000).code, algorithm).toBe(expected[algorithm]);
    }
  });

  it("matches a reference implementation for random secrets, times and settings", () => {
    for (let i = 0; i < 200; i++) {
      const key = randomBytes(10 + (i % 30));
      const algorithm = (["SHA1", "SHA256", "SHA512"] as const)[i % 3]!;
      const digits = 6 + (i % 3);
      const period = [30, 60, 15][i % 3]!;
      const t = Math.floor(Math.random() * 4_000_000_000);
      const p = params(base32(key), { algorithm, digits, period });
      expect(currentTotpCode(p, t * 1000).code).toBe(
        referenceTotp(key, t, algorithm, digits, period)
      );
    }
  });

  it("reports the seconds left in the current period", () => {
    const p = params("JBSWY3DPEHPK3PXP");
    expect(currentTotpCode(p, 60_000).secondsLeft).toBe(30);
    expect(currentTotpCode(p, 89_000).secondsLeft).toBe(1);
    expect(currentTotpCode(p, 75_500).secondsLeft).toBe(15);
  });
});

describe("parseTotpInput", () => {
  it("reads a bare base32 key: spaces, dashes, case and padding don't matter", () => {
    expect(parseTotpInput(" jbsw y3dp-ehpk 3pxp== ", { issuer: "GitHub", account: "me" })).toEqual(
      params("JBSWY3DPEHPK3PXP", { issuer: "GitHub", account: "me" })
    );
  });

  it("reads an otpauth:// link with its issuer, account and parameters", () => {
    expect(
      parseTotpInput(
        "otpauth://totp/ACME%20Co:john@example.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=ACME%20Co&algorithm=SHA512&digits=8&period=60",
        { issuer: "ignored", account: "ignored" }
      )
    ).toEqual({
      secret: "HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ",
      issuer: "ACME Co",
      account: "john@example.com",
      algorithm: "SHA512",
      digits: 8,
      period: 60,
    });
  });

  it("round-trips through totpParamsToUri", () => {
    const p = params("HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ", {
      issuer: "ACME",
      account: "jo",
      algorithm: "SHA256",
      digits: 7,
      period: 45,
    });
    expect(parseTotpInput(totpParamsToUri(p))).toEqual(p);
  });

  it.each([
    ["not base32!"],
    ["ABC"],
    ["otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP&counter=1"],
    ["otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=4"],
    ["otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&algorithm=MD5"],
    ["otpauth://totp/x"],
    [""],
  ])("rejects %j", (input) => {
    expect(() => parseTotpInput(input)).toThrow(TotpParseError);
  });
});
