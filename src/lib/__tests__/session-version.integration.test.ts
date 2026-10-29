import { beforeEach, describe, expect, it } from "vitest";
import type { JWT } from "next-auth/jwt";
import { db } from "@/lib/db";
import { signOut } from "@/lib/auth"; // mocked in src/test/integration/setup.ts
import { hashPassword } from "@/lib/password";
import { generateToken } from "@/lib/tokens";
import { authorizeCredentials } from "@/lib/authorize-credentials";
import { checkTokenVersion, TOKEN_VERSION_CHECK_INTERVAL_MS } from "@/lib/session-version";
import { signOutEverywhereAction } from "@/server/settings-actions";
import { resetPasswordAction } from "@/server/auth-actions";
import { createTestUser, grantRecentReauth, signInAs } from "@/test/integration/helpers";

const T0 = Date.UTC(2026, 9, 29, 16, 0, 0);
const LATER = T0 + TOKEN_VERSION_CHECK_INTERVAL_MS + 1;

let user: { id: string; email: string };

/** A token as issued at sign-in time T0 with the user's then-current version. */
function tokenFor(userId: string, tokenVersion: number | undefined = 0): JWT {
  return { sub: userId, tokenVersion, verCheckedAt: T0 };
}

beforeEach(async () => {
  user = await createTestUser({ email: "alice@test.local" });
});

describe("checkTokenVersion", () => {
  it("keeps a current token and refreshes verCheckedAt", async () => {
    const result = await checkTokenVersion(tokenFor(user.id), LATER);
    expect(result).toMatchObject({ sub: user.id, tokenVersion: 0, verCheckedAt: LATER });
  });

  it("rejects the old token after Sign out of all devices", async () => {
    signInAs(user);
    await grantRecentReauth(user.id);
    await signOutEverywhereAction();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/auth/signin" }); // this device

    expect(await db.user.findUnique({ where: { id: user.id } })).toMatchObject({
      tokenVersion: 1,
    });
    expect(await checkTokenVersion(tokenFor(user.id), LATER)).toBeNull(); // other devices
  });

  it("rejects the old token after a password reset", async () => {
    const token = await generateToken("reset", user.email);
    const result = await resetPasswordAction({
      email: user.email,
      token,
      password: "Brand-New-Password-1!",
      confirmPassword: "Brand-New-Password-1!",
    });
    expect(result).toEqual({ success: true });
    expect(await checkTokenVersion(tokenFor(user.id), LATER)).toBeNull();
  });

  it("only re-reads the database once the check interval has passed", async () => {
    await db.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
    // Within the interval the cached check stands…
    expect(await checkTokenVersion(tokenFor(user.id), T0 + 1_000)).not.toBeNull();
    // …after it, the revocation is seen.
    expect(await checkTokenVersion(tokenFor(user.id), LATER)).toBeNull();
  });

  it("ends the session when the user no longer exists", async () => {
    await db.user.delete({ where: { id: user.id } });
    expect(await checkTokenVersion(tokenFor(user.id), LATER)).toBeNull();
  });

  it("treats pre-versioning tokens as version 0 until the first revocation", async () => {
    expect(await checkTokenVersion(tokenFor(user.id, undefined), LATER)).not.toBeNull();
    await db.user.update({ where: { id: user.id }, data: { tokenVersion: 1 } });
    expect(await checkTokenVersion(tokenFor(user.id, undefined), LATER)).toBeNull();
  });

  it("issues new sign-ins with the new version, which then pass", async () => {
    const password = "Correct-Horse-9!";
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password), tokenVersion: 3 },
    });
    const signedIn = await authorizeCredentials(
      { email: user.email, password },
      new Request("http://localhost/api/auth/callback/credentials", {
        method: "POST",
        headers: { "x-real-ip": "203.0.113.5" },
      })
    );
    expect(signedIn).toMatchObject({ tokenVersion: 3 });
    expect(await checkTokenVersion(tokenFor(user.id, 3), LATER)).not.toBeNull();
  });
});
