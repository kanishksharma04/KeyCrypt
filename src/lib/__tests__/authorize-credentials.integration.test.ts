import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { authorizeCredentials, RateLimitedError } from "@/lib/authorize-credentials";

const PASSWORD = "Correct-Horse-9!";
const EMAIL = "alice@test.local";

/** A request as it reaches /api/auth/callback/credentials, from one client IP. */
function requestFrom(ip: string): Request {
  return new Request("http://localhost/api/auth/callback/credentials", {
    method: "POST",
    headers: { "x-real-ip": ip },
  });
}

async function attempt(ip: string, password: string, email = EMAIL) {
  return authorizeCredentials({ email, password }, requestFrom(ip));
}

describe("authorizeCredentials", () => {
  beforeEach(async () => {
    await db.user.create({
      data: { email: EMAIL, passwordHash: await hashPassword(PASSWORD), emailVerified: new Date() },
    });
  });

  it("signs in with the right password and rejects a wrong one", async () => {
    expect(await attempt("203.0.113.1", PASSWORD)).toMatchObject({ email: EMAIL });
    expect(await attempt("203.0.113.1", "wrong-password")).toBeNull();
  });

  it("signs in whatever the capitalisation of the email, ignoring spaces", async () => {
    expect(await attempt("203.0.113.1", PASSWORD, "  Alice@Test.LOCAL ")).toMatchObject({
      email: EMAIL,
    });
  });

  it("finds an account stored with capitals (from before emails were lower-cased)", async () => {
    await db.user.create({
      data: {
        email: "Bob@Test.Local",
        passwordHash: await hashPassword(PASSWORD),
        emailVerified: new Date(),
      },
    });
    expect(await attempt("203.0.113.1", PASSWORD, "bob@test.local")).toMatchObject({
      email: "Bob@Test.Local",
    });
  });

  it("returns null (not an error) for an unknown email", async () => {
    expect(await attempt("203.0.113.1", PASSWORD, "nobody@test.local")).toBeNull();
  });

  it("rejects the 6th attempt from one IP, even with the right password", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await attempt("203.0.113.7", "wrong-password")).toBeNull();
    }
    const sixth = attempt("203.0.113.7", PASSWORD);
    await expect(sixth).rejects.toBeInstanceOf(RateLimitedError);
    await expect(sixth).rejects.toMatchObject({ code: "RATE_LIMITED" });

    // Another IP is unaffected.
    expect(await attempt("198.51.100.2", PASSWORD)).toMatchObject({ email: EMAIL });
  });

  it("rejects the 11th attempt on one account across many IPs", async () => {
    for (let i = 0; i < 10; i++) {
      expect(await attempt(`192.0.2.${i + 1}`, "wrong-password")).toBeNull();
    }
    await expect(attempt("192.0.2.200", PASSWORD)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("counts attempts against unknown emails too", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await attempt("203.0.113.9", "x", `probe${i}@test.local`)).toBeNull();
    }
    await expect(attempt("203.0.113.9", "x", "probe5@test.local")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });
});
