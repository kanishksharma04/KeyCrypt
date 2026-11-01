import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearVaultKey,
  createVerificationBlob,
  decryptItem,
  DEFAULT_ARGON2ID_PARAMS,
  deriveVaultKey,
  encryptItem,
  generateSalt,
  toBase64,
} from "@/lib/crypto";
import { db } from "@/lib/db";
import { REAUTH_REQUIRED_ERROR, VAULT_CHANGED_ERROR } from "@/lib/action-errors";
import { upgradeVaultAction, type VaultMetaForUnlock } from "@/server/vault-actions";
import { unlockVault, upgradeVaultToV2 } from "@/features/vault/vault-crypto";
import {
  clearTestCookies,
  createTestUser,
  grantRecentReauth,
  signInAs,
} from "@/test/integration/helpers";

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

// Lets a test simulate "another tab added an item" right after the client
// fetched the item list for re-encryption.
const afterItemsFetched = vi.hoisted(() => ({ hook: null as null | (() => Promise<void>) }));
vi.mock("@/server/settings-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/settings-actions")>();
  return {
    ...actual,
    getAllItemsForReEncryptionAction: async () => {
      const items = await actual.getAllItemsForReEncryptionAction();
      const hook = afterItemsFetched.hook;
      afterItemsFetched.hook = null;
      if (hook) await hook();
      return items;
    },
  };
});

const MASTER = "Master-Password-1!";
const JUNK = {
  kdf: "argon2id" as const,
  kdfParams: DEFAULT_ARGON2ID_PARAMS,
  newSalt: "AAAAAAAAAAAAAAAAAAAAAA==",
  wrappedVaultKey: "W".repeat(64),
  wrapIv: "AAAAAAAAAAAAAAAA",
  newVerificationBlob: "anVuaw==",
  newVerificationIv: "AAAAAAAAAAAAAAAA",
};

let userId: string;
let v1Key: CryptoKey;
let itemIds: string[];

async function snapshot() {
  return {
    meta: await db.vaultMeta.findUniqueOrThrow({ where: { userId } }),
    items: await db.vaultItem.findMany({ where: { userId }, orderBy: { id: "asc" } }),
  };
}

async function currentVerifier() {
  const m = await db.vaultMeta.findUniqueOrThrow({ where: { userId } });
  return { currentVerificationBlob: m.verificationBlob!, currentVerificationIv: m.verificationIv! };
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
  };
}

/** Opaque re-encrypted payloads for the given ids. */
const reencrypted = (ids: string[]) =>
  ids.map((id) => ({ id, ciphertext: "bmV3LWNpcGhlcnRleHQ=", iv: "BBBBBBBBBBBBBBBB" }));

beforeEach(async () => {
  afterItemsFetched.hook = null;
  clearVaultKey();
  const user = await createTestUser();
  userId = user.id;
  signInAs(user);
  await grantRecentReauth(user.id);

  // A real v1 vault: vaultKey = PBKDF2(master, salt), two items.
  const salt = generateSalt();
  v1Key = await deriveVaultKey(MASTER, salt);
  const blob = await createVerificationBlob(v1Key);
  await db.vaultMeta.create({
    data: {
      userId,
      cryptoVersion: 1,
      salt: toBase64(salt),
      verificationBlob: blob.ciphertext,
      verificationIv: blob.iv,
    },
  });
  itemIds = [];
  for (const secret of ["alpha", "bravo"]) {
    const { ciphertext, iv } = await encryptItem(v1Key, { secret });
    const item = await db.vaultItem.create({
      data: { userId, type: "LOGIN", name: secret, ciphertext, iv },
      select: { id: true },
    });
    itemIds.push(item.id);
  }
});

describe("v1 → v2 upgrade (browser flow end to end)", () => {
  it("unlocking a v1 vault reports it needs an upgrade", async () => {
    const result = await unlockVault(MASTER, await metaForUnlock());
    expect(result.status).toBe("needs-upgrade");
  });

  it("re-encrypts every item under a wrapped random key, keeping all items intact", async () => {
    const before = await snapshot();
    const result = await upgradeVaultToV2(MASTER, v1Key);
    if (!result.ok) throw new Error(result.error);
    expect(result.vaultKey.extractable).toBe(false);

    const after = await snapshot();
    expect(after.meta).toMatchObject({ cryptoVersion: 2 });
    expect(after.meta.wrappedVaultKey).toHaveLength(64);
    expect(after.meta.salt).not.toBe(before.meta.salt);
    expect(after.items.map((i) => i.id)).toEqual(before.items.map((i) => i.id));

    // Unlocking now takes the v2 path with the SAME master password.
    const unlocked = await unlockVault(MASTER, await metaForUnlock());
    if (unlocked.status !== "unlocked") throw new Error(`unexpected ${unlocked.status}`);
    const secrets = await Promise.all(after.items.map((i) => decryptItem(unlocked.vaultKey, i)));
    expect(secrets).toEqual(expect.arrayContaining([{ secret: "alpha" }, { secret: "bravo" }]));
    // The old v1 key no longer opens anything.
    await expect(decryptItem(v1Key, after.items[0]!)).rejects.toThrow();
    expect(await db.auditLog.count({ where: { action: "vault.upgraded" } })).toBe(1);
  });

  it("retries once when an item is added mid-upgrade, and keeps the new item", async () => {
    afterItemsFetched.hook = async () => {
      const { ciphertext, iv } = await encryptItem(v1Key, { secret: "charlie" });
      await db.vaultItem.create({
        data: { userId, type: "LOGIN", name: "charlie", ciphertext, iv },
      });
    };
    const result = await upgradeVaultToV2(MASTER, v1Key);
    if (!result.ok) throw new Error(result.error);

    const items = await db.vaultItem.findMany({ where: { userId } });
    const secrets = await Promise.all(items.map((i) => decryptItem(result.vaultKey, i)));
    expect(secrets).toEqual(
      expect.arrayContaining([{ secret: "alpha" }, { secret: "bravo" }, { secret: "charlie" }])
    );
  });
});

describe("upgradeVaultAction rejects incomplete or forged upgrades (KC-18 checks)", () => {
  it("requires a recent account-password confirmation", async () => {
    clearTestCookies();
    const before = await snapshot();
    const result = await upgradeVaultAction({
      ...(await currentVerifier()),
      ...JUNK,
      items: reencrypted(itemIds),
    });
    expect(result).toEqual({ error: REAUTH_REQUIRED_ERROR });
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ["a missing item", () => reencrypted([itemIds[0]!])],
    ["duplicate ids hiding a missing item", () => reencrypted([itemIds[0]!, itemIds[0]!])],
    ["no items at all (the wipe attack)", () => []],
  ])("rejects %s and changes nothing", async (_label, items) => {
    const before = await snapshot();
    const result = await upgradeVaultAction({
      ...(await currentVerifier()),
      ...JUNK,
      items: items(),
    });
    expect(result).toEqual({ error: VAULT_CHANGED_ERROR });
    expect(await snapshot()).toEqual(before);
  });

  it("rejects an extra item (another user's) and changes nothing", async () => {
    const other = await createTestUser();
    const foreign = await db.vaultItem.create({
      data: { userId: other.id, type: "LOGIN", name: "x", ciphertext: "eA==", iv: JUNK.wrapIv },
      select: { id: true },
    });
    const before = await snapshot();
    const result = await upgradeVaultAction({
      ...(await currentVerifier()),
      ...JUNK,
      items: reencrypted([...itemIds, foreign.id]),
    });
    expect(result).toEqual({ error: VAULT_CHANGED_ERROR });
    expect(await snapshot()).toEqual(before);
  });

  it("rejects a wrong current verifier and changes nothing", async () => {
    const before = await snapshot();
    const result = await upgradeVaultAction({
      currentVerificationBlob: "anVuaw==",
      currentVerificationIv: JUNK.wrapIv,
      ...JUNK,
      items: reencrypted(itemIds),
    });
    expect(result).toEqual({ error: VAULT_CHANGED_ERROR });
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to upgrade a vault that is already v2", async () => {
    const ok = await upgradeVaultToV2(MASTER, v1Key);
    if (!ok.ok) throw new Error(ok.error);
    const before = await snapshot();
    const result = await upgradeVaultAction({
      ...(await currentVerifier()),
      ...JUNK,
      items: reencrypted(itemIds),
    });
    expect(result).toEqual({ error: VAULT_CHANGED_ERROR });
    expect(await snapshot()).toEqual(before);
  });
});
