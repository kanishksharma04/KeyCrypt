import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { REAUTH_REQUIRED_ERROR } from "@/lib/action-errors";
import {
  createReauthCookieValue,
  REAUTH_COOKIE,
  REAUTH_TTL_MS,
  requireRecentReauth,
} from "@/lib/reauth";
import { confirmAccountPasswordAction } from "@/server/reauth-actions";
import { changeMasterPasswordAction, signOutEverywhereAction } from "@/server/settings-actions";
import {
  createTestUser,
  getTestCookie,
  setTestCookie,
  signInAs,
  signOutTestUser,
} from "@/test/integration/helpers";

const ACCOUNT_PASSWORD = "Account-Password-1!";
const BLOB = "dmVyaWZpZXI=";
const IV = "AAAAAAAAAAAAAAAA";

let user: { id: string; email: string };

/** A complete, valid master-password change for a vault with no items. */
function validChange() {
  return changeMasterPasswordAction({
    currentVerificationBlob: BLOB,
    currentVerificationIv: IV,
    newSalt: "BBBBBBBBBBBBBBBBBBBBBA==",
    newVerificationBlob: "bmV3LXZlcmlmaWVy",
    newVerificationIv: "CCCCCCCCCCCCCCCC",
    items: [],
  });
}

async function nothingChanged() {
  expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
    tokenVersion: 0,
  });
  expect(await db.vaultMeta.findUniqueOrThrow({ where: { userId: user.id } })).toMatchObject({
    verificationBlob: BLOB,
  });
}

/** Both protected actions must refuse with the re-auth error and change nothing. */
async function expectRefused() {
  expect(await validChange()).toEqual({ error: REAUTH_REQUIRED_ERROR });
  expect(await signOutEverywhereAction()).toEqual({ error: REAUTH_REQUIRED_ERROR });
  await nothingChanged();
}

beforeEach(async () => {
  user = await createTestUser({ email: "alice@test.local" });
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(ACCOUNT_PASSWORD) },
  });
  await db.vaultMeta.create({
    data: {
      userId: user.id,
      salt: "AAAAAAAAAAAAAAAAAAAAAA==",
      verificationBlob: BLOB,
      verificationIv: IV,
    },
  });
  signInAs(user);
});

describe("protected actions refuse without a fresh confirmation", () => {
  it("refuses with no re-auth cookie", async () => {
    await expectRefused();
  });

  it("refuses an expired cookie", async () => {
    setTestCookie(REAUTH_COOKIE, await createReauthCookieValue(user.id, Date.now() - 1));
    await expectRefused();
  });

  it("refuses a cookie that expires once the 5-minute window has passed", async () => {
    expect(await confirmAccountPasswordAction(ACCOUNT_PASSWORD)).toEqual({});
    expect(await requireRecentReauth(user.id)).toEqual({ ok: true });
    expect(await requireRecentReauth(user.id, Date.now() + REAUTH_TTL_MS + 1)).toMatchObject({
      ok: false,
    });
  });

  it("refuses tampered cookies", async () => {
    const valid = await createReauthCookieValue(user.id, Date.now() + REAUTH_TTL_MS);
    const [id, exp, sig] = valid.split(".") as [string, string, string];
    const flippedSig = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    const tampered = [
      `${id}.${exp}.${flippedSig}`, // forged signature
      `${id}.${Number(exp) + 3_600_000}.${sig}`, // extended expiry
      `${id}.${exp}`, // signature stripped
      `${id}.${exp}.${sig}.extra`, // extra segment
      "garbage",
    ];
    for (const value of tampered) {
      setTestCookie(REAUTH_COOKIE, value);
      await expectRefused();
    }
  });

  it("refuses a validly signed cookie issued for another user", async () => {
    const other = await createTestUser();
    setTestCookie(
      REAUTH_COOKIE,
      await createReauthCookieValue(other.id, Date.now() + REAUTH_TTL_MS)
    );
    await expectRefused();
  });
});

describe("confirmAccountPasswordAction", () => {
  it("sets no cookie for a wrong password", async () => {
    expect(await confirmAccountPasswordAction("wrong-password")).toEqual({
      error: "Incorrect account password.",
    });
    expect(getTestCookie(REAUTH_COOKIE)).toBeUndefined();
    await expectRefused();
  });

  it("sets an httpOnly, Secure, SameSite=Strict 5-minute cookie for the right password", async () => {
    expect(await confirmAccountPasswordAction(ACCOUNT_PASSWORD)).toEqual({});
    expect(getTestCookie(REAUTH_COOKIE)?.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 300,
    });
  });

  it("then lets the master-password change succeed", async () => {
    await confirmAccountPasswordAction(ACCOUNT_PASSWORD);
    expect(await validChange()).toEqual({});
    expect(await db.vaultMeta.findUniqueOrThrow({ where: { userId: user.id } })).toMatchObject({
      verificationBlob: "bmV3LXZlcmlmaWVy",
    });
  });

  it("then lets sign-out-everywhere succeed", async () => {
    await confirmAccountPasswordAction(ACCOUNT_PASSWORD);
    await signOutEverywhereAction();
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      tokenVersion: 1,
    });
  });

  it("is rate limited after 5 attempts", async () => {
    for (let i = 0; i < 5; i++) await confirmAccountPasswordAction("wrong-password");
    expect(await confirmAccountPasswordAction(ACCOUNT_PASSWORD)).toEqual({
      error: "Too many attempts. Try again in 15 minutes.",
    });
    expect(getTestCookie(REAUTH_COOKIE)).toBeUndefined();
  });

  it("requires a session", async () => {
    signOutTestUser();
    expect(await confirmAccountPasswordAction(ACCOUNT_PASSWORD)).toEqual({
      error: "Not authenticated",
    });
  });
});
