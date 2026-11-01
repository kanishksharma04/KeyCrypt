import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearVaultKey,
  decryptItem,
  DEFAULT_ARGON2ID_PARAMS,
  encryptItem,
  setVaultKey,
} from "@/lib/crypto";
import { db } from "@/lib/db";
import { VAULT_CHANGED_ERROR } from "@/lib/action-errors";
import { changeMasterPasswordAction } from "@/server/settings-actions";
import { changeMasterPassword } from "@/features/vault/change-master-password";
import { createVaultKeys, unlockVault } from "@/features/vault/vault-crypto";
import type { VaultMetaForUnlock } from "@/server/vault-actions";
import { createTestUser, grantRecentReauth, signInAs } from "@/test/integration/helpers";

// Fast KDFs for tests (1,000 iterations); all other crypto is real.
vi.mock("@/lib/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crypto")>();
  const { FAST_TEST_KDF } = await import("@/test/fast-kdf");
  return {
    ...actual,
    deriveVaultKey: (pw: string, salt: Uint8Array<ArrayBuffer>) =>
      actual.deriveVaultKey(pw, salt, 1_000),
    deriveKek: (pw: string, salt: Uint8Array<ArrayBuffer>) =>
      actual.deriveKek(pw, salt, FAST_TEST_KDF),
  };
});

const OLD_PASSWORD = "Old-Master-Password-1!";
const NEW_PASSWORD = "New-Master-Password-2!";

let userId: string;

async function snapshot() {
  return {
    meta: await db.vaultMeta.findUniqueOrThrow({ where: { userId } }),
    items: await db.vaultItem.findMany({ where: { userId }, orderBy: { id: "asc" } }),
  };
}

async function metaForUnlock(): Promise<VaultMetaForUnlock> {
  const m = await db.vaultMeta.findUniqueOrThrow({ where: { userId } });
  return {
    cryptoVersion: m.cryptoVersion,
    kdf: m.kdf,
    kdfParams: m.kdfParams,
    salt: m.salt,
    verificationBlob: m.verificationBlob!,
    verificationIv: m.verificationIv!,
    wrappedVaultKey: m.wrappedVaultKey,
    wrapIv: m.wrapIv,
    recoveryWrappedKey: m.recoveryWrappedKey,
    recoveryIv: m.recoveryIv,
    recoveryCreatedAt: m.recoveryCreatedAt?.toISOString() ?? null,
  };
}

beforeEach(async () => {
  clearVaultKey();
  const user = await createTestUser();
  userId = user.id;
  signInAs(user);
  await grantRecentReauth(user.id);

  // A real v2 vault with two items.
  const { vaultKey, setup } = await createVaultKeys(OLD_PASSWORD, userId);
  await db.vaultMeta.create({ data: { userId, cryptoVersion: 2, ...setup } });
  for (const secret of ["alpha", "bravo"]) {
    const { ciphertext, iv } = await encryptItem(vaultKey, { secret });
    await db.vaultItem.create({ data: { userId, type: "LOGIN", name: secret, ciphertext, iv } });
  }
  setVaultKey(vaultKey);
});

describe("changeMasterPassword (crypto v2)", () => {
  it("re-wraps the vault key only: items are untouched and stay readable", async () => {
    const before = await snapshot();

    expect(await changeMasterPassword(OLD_PASSWORD, NEW_PASSWORD)).toEqual({ ok: true });

    const after = await snapshot();
    expect(after.items).toEqual(before.items); // not a single item rewritten
    expect(after.meta.salt).not.toBe(before.meta.salt);
    expect(after.meta.wrappedVaultKey).not.toBe(before.meta.wrappedVaultKey);
    expect(after.meta.verificationBlob).toBe(before.meta.verificationBlob);

    const meta = await metaForUnlock();
    expect((await unlockVault(OLD_PASSWORD, meta)).status).toBe("wrong-password");
    const unlocked = await unlockVault(NEW_PASSWORD, meta);
    if (unlocked.status !== "unlocked") throw new Error(`unexpected ${unlocked.status}`);
    const secrets = await Promise.all(after.items.map((i) => decryptItem(unlocked.vaultKey, i)));
    expect(secrets).toEqual(expect.arrayContaining([{ secret: "alpha" }, { secret: "bravo" }]));
    expect(await db.auditLog.count({ where: { action: "vault.master_password.changed" } })).toBe(1);
  });

  it("rejects a wrong current password without touching the server", async () => {
    const before = await snapshot();
    expect(await changeMasterPassword("Wrong-Password-9!", NEW_PASSWORD)).toEqual({
      ok: false,
      error: "Current master password is incorrect.",
    });
    expect(await snapshot()).toEqual(before);
  });
});

describe("changeMasterPasswordAction", () => {
  const rewrap = (current: string) =>
    changeMasterPasswordAction({
      currentWrappedVaultKey: current,
      currentWrapIv: "AAAAAAAAAAAAAAAA",
      kdf: "argon2id",
      kdfParams: DEFAULT_ARGON2ID_PARAMS,
      newSalt: "AAAAAAAAAAAAAAAAAAAAAA==",
      newWrappedVaultKey: "N".repeat(64),
      newWrapIv: "AAAAAAAAAAAAAAAA",
    });

  it("rejects a stale current wrapped key (e.g. changed in another tab)", async () => {
    const before = await snapshot();
    expect(await rewrap("S".repeat(64))).toEqual({ error: VAULT_CHANGED_ERROR });
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to re-wrap a v1 vault", async () => {
    await db.vaultMeta.update({
      where: { userId },
      data: { cryptoVersion: 1, wrappedVaultKey: null, wrapIv: null },
    });
    const before = await snapshot();
    expect(await rewrap("W".repeat(64))).toEqual({ error: VAULT_CHANGED_ERROR });
    expect(await snapshot()).toEqual(before);
  });
});
