import { beforeEach, describe, expect, it } from "vitest";
import { signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { logAudit } from "@/lib/audit";
import { generateToken } from "@/lib/tokens";
import { authorizeCredentials } from "@/lib/authorize-credentials";
import { deleteAccountAction } from "@/server/account-actions";
import { grantRecentReauth, signInAs, signOutTestUser } from "@/test/integration/helpers";

const PASSWORD = "Correct-Horse-9!";

/** A user with something in every table that references them. */
async function createUserWithData(email: string) {
  const user = await db.user.create({
    data: {
      email,
      name: "Doomed",
      passwordHash: await hashPassword(PASSWORD),
      emailVerified: new Date(),
      totpBackupCodes: ["$argon2id$placeholder"],
    },
    select: { id: true, email: true },
  });
  const userId = user.id;
  await db.vaultMeta.create({ data: { userId, salt: "c2FsdHNhbHRzYWx0c2FsdA==" } });
  await db.vaultItem.createMany({
    data: [
      { userId, type: "LOGIN", ciphertext: "AAAA", iv: "AAAAAAAAAAAAAAAA" },
      { userId, type: "SECURE_NOTE", ciphertext: "BBBB", iv: "BBBBBBBBBBBBBBBB" },
    ],
  });
  await db.account.create({
    data: { userId, type: "oauth", provider: "github", providerAccountId: `gh-${userId}` },
  });
  await db.session.create({
    data: { userId, sessionToken: `st-${userId}`, expires: new Date(Date.now() + 60_000) },
  });
  await db.authenticator.create({
    data: {
      userId,
      credentialID: `cred-${userId}`,
      providerAccountId: `pa-${userId}`,
      credentialPublicKey: "pk",
      counter: 0,
      credentialDeviceType: "singleDevice",
      credentialBackedUp: false,
    },
  });
  await db.folder.create({
    data: {
      id: (await import("crypto")).randomUUID(),
      userId,
      nameCiphertext: "bmFtZQ==",
      nameIv: "aXYtaXYtaXYtaXYt",
    },
  });
  await logAudit(userId, "auth.signin");
  await logAudit(userId, "vault.item.create", { type: "LOGIN" });
  await generateToken("reset", email);
  await generateToken("verify", email);
  return user;
}

async function rowsFor(userId: string, email: string) {
  const [users, metas, items, accounts, sessions, authenticators, audit, tokens, folders] =
    await Promise.all([
      db.user.count({ where: { id: userId } }),
      db.vaultMeta.count({ where: { userId } }),
      db.vaultItem.count({ where: { userId } }),
      db.account.count({ where: { userId } }),
      db.session.count({ where: { userId } }),
      db.authenticator.count({ where: { userId } }),
      db.auditLog.count({ where: { userId } }),
      db.verificationToken.count({ where: { identifier: { endsWith: `:${email}` } } }),
      db.folder.count({ where: { userId } }),
    ]);
  return { users, metas, items, accounts, sessions, authenticators, audit, tokens, folders };
}

const ALL_GONE = {
  users: 0,
  metas: 0,
  items: 0,
  accounts: 0,
  sessions: 0,
  authenticators: 0,
  audit: 0,
  tokens: 0,
  folders: 0,
};

function signInAttempt(email: string) {
  return authorizeCredentials(
    { email, password: PASSWORD },
    new Request("http://localhost/api/auth/callback/credentials", {
      method: "POST",
      headers: { "x-real-ip": "203.0.113.20" },
    })
  );
}

describe("deleteAccountAction", () => {
  let alice: { id: string; email: string };
  let bob: { id: string; email: string };

  beforeEach(async () => {
    alice = await createUserWithData("alice@test.local");
    bob = await createUserWithData("bob@test.local");
    signInAs(alice);
  });

  it("deletes every row for the user and signs them out", async () => {
    expect(await rowsFor(alice.id, alice.email)).toMatchObject({ users: 1, items: 2, audit: 2 });

    await grantRecentReauth(alice.id);
    expect(await deleteAccountAction({ email: " Alice@Test.local " })).toEqual({});

    expect(await rowsFor(alice.id, alice.email)).toEqual(ALL_GONE);
    // Nothing references the old id any more, not even a nulled-out audit row.
    expect(await db.auditLog.count({ where: { userId: null } })).toBe(0);
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/auth/signin?deleted=1" });

    // The account can no longer sign in.
    expect(await signInAttempt(alice.email)).toBeNull();
  });

  it("leaves other users untouched", async () => {
    await grantRecentReauth(alice.id);
    await deleteAccountAction({ email: alice.email });

    expect(await rowsFor(bob.id, bob.email)).toEqual({
      users: 1,
      metas: 1,
      items: 2,
      accounts: 1,
      sessions: 1,
      authenticators: 1,
      audit: 2,
      tokens: 2,
      folders: 1,
    });
    expect(await signInAttempt(bob.email)).toMatchObject({ id: bob.id });
  });

  it("requires a recent account-password confirmation", async () => {
    expect(await deleteAccountAction({ email: alice.email })).toEqual({
      error: expect.any(String),
    });
    expect(await rowsFor(alice.id, alice.email)).toMatchObject({ users: 1, items: 2 });
  });

  it("requires the typed email to match the account", async () => {
    await grantRecentReauth(alice.id);
    expect(await deleteAccountAction({ email: bob.email })).toEqual({
      error: "That doesn't match your account email.",
    });
    expect(await rowsFor(alice.id, alice.email)).toMatchObject({ users: 1, items: 2 });
    expect(await rowsFor(bob.id, bob.email)).toMatchObject({ users: 1, items: 2 });
  });

  it("rejects invalid input and requires a session", async () => {
    await grantRecentReauth(alice.id);
    expect(await deleteAccountAction({ email: "" })).toEqual({ error: "Invalid input" });
    expect(await deleteAccountAction({ email: "x".repeat(300) })).toEqual({
      error: "Invalid input",
    });

    signOutTestUser();
    expect(await deleteAccountAction({ email: alice.email })).toEqual({
      error: "Not authenticated",
    });
    expect(await rowsFor(alice.id, alice.email)).toMatchObject({ users: 1 });
  });
});
