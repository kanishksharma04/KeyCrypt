import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearVaultKey,
  createVerificationBlob,
  decryptItem,
  deriveVaultKey,
  encryptItem,
  fromBase64,
  generateSalt,
  setVaultKey,
  toBase64,
} from "@/lib/crypto";
import { db } from "@/lib/db";
import { VAULT_CHANGED_ERROR } from "@/lib/action-errors";
import { changeMasterPasswordAction } from "@/server/settings-actions";
import { changeMasterPassword } from "@/features/vault/change-master-password";
import { createTestUser, signInAs } from "@/test/integration/helpers";

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

const OLD_PASSWORD = "Old-Master-Password-1!";
const NEW_PASSWORD = "New-Master-Password-2!";
const JUNK_SALT = "AAAAAAAAAAAAAAAAAAAAAA==";
const JUNK_BLOB = "anVuaw==";
const JUNK_IV = "AAAAAAAAAAAAAAAA";

let userId: string;
let oldKey: CryptoKey;
let itemIds: string[];

async function snapshot() {
  return {
    meta: await db.vaultMeta.findUnique({ where: { userId } }),
    items: await db.vaultItem.findMany({ where: { userId }, orderBy: { id: "asc" } }),
  };
}

async function currentVerifier() {
  const meta = await db.vaultMeta.findUniqueOrThrow({ where: { userId } });
  return {
    currentVerificationBlob: meta.verificationBlob!,
    currentVerificationIv: meta.verificationIv!,
  };
}

/** Opaque re-encrypted payloads for the given ids (server can't tell them apart). */
function reEncrypted(ids: string[]) {
  return ids.map((id) => ({ id, ciphertext: "bmV3LWNpcGhlcnRleHQ=", iv: "BBBBBBBBBBBBBBBB" }));
}

beforeEach(async () => {
  afterItemsFetched.hook = null;
  clearVaultKey();

  const user = await createTestUser();
  userId = user.id;
  signInAs(user);

  // A real vault: salt + verifier + items, all under the old master password.
  const salt = generateSalt();
  oldKey = await deriveVaultKey(OLD_PASSWORD, salt);
  const blob = await createVerificationBlob(oldKey);
  await db.vaultMeta.create({
    data: {
      userId,
      salt: toBase64(salt),
      verificationBlob: blob.ciphertext,
      verificationIv: blob.iv,
    },
  });

  itemIds = [];
  for (const secret of ["alpha", "bravo"]) {
    const { ciphertext, iv } = await encryptItem(oldKey, { secret });
    const item = await db.vaultItem.create({
      data: { userId, type: "LOGIN", name: secret, ciphertext, iv },
      select: { id: true },
    });
    itemIds.push(item.id);
  }
  setVaultKey(oldKey);
});

describe("changeMasterPasswordAction: rejects incomplete or forged re-keys", () => {
  it("rejects a missing item and changes nothing", async () => {
    const before = await snapshot();
    const result = await changeMasterPasswordAction({
      ...(await currentVerifier()),
      newSalt: JUNK_SALT,
      newVerificationBlob: JUNK_BLOB,
      newVerificationIv: JUNK_IV,
      items: reEncrypted([itemIds[0]!]),
    });
    expect(result).toEqual({ error: VAULT_CHANGED_ERROR });
    expect(await snapshot()).toEqual(before);
  });

  it("rejects an extra item (another user's) and changes nothing", async () => {
    const other = await createTestUser();
    const foreign = await db.vaultItem.create({
      data: { userId: other.id, type: "LOGIN", name: "x", ciphertext: "eA==", iv: JUNK_IV },
      select: { id: true },
    });
    const before = await snapshot();
    const foreignBefore = await db.vaultItem.findUnique({ where: { id: foreign.id } });

    const result = await changeMasterPasswordAction({
      ...(await currentVerifier()),
      newSalt: JUNK_SALT,
      newVerificationBlob: JUNK_BLOB,
      newVerificationIv: JUNK_IV,
      items: reEncrypted([...itemIds, foreign.id]),
    });
    expect(result).toEqual({ error: VAULT_CHANGED_ERROR });
    expect(await snapshot()).toEqual(before);
    expect(await db.vaultItem.findUnique({ where: { id: foreign.id } })).toEqual(foreignBefore);
  });

  it("rejects duplicate ids that hide a missing item", async () => {
    const before = await snapshot();
    const result = await changeMasterPasswordAction({
      ...(await currentVerifier()),
      newSalt: JUNK_SALT,
      newVerificationBlob: JUNK_BLOB,
      newVerificationIv: JUNK_IV,
      items: reEncrypted([itemIds[0]!, itemIds[0]!]),
    });
    expect(result).toEqual({ error: VAULT_CHANGED_ERROR });
    expect(await snapshot()).toEqual(before);
  });

  it("rejects a wrong current verifier and changes nothing", async () => {
    const before = await snapshot();
    const result = await changeMasterPasswordAction({
      currentVerificationBlob: JUNK_BLOB,
      currentVerificationIv: JUNK_IV,
      newSalt: JUNK_SALT,
      newVerificationBlob: JUNK_BLOB,
      newVerificationIv: JUNK_IV,
      items: reEncrypted(itemIds),
    });
    expect(result).toEqual({ error: VAULT_CHANGED_ERROR });
    expect(await snapshot()).toEqual(before);
  });

  it("rejects the stolen-session wipe (no items, junk salt)", async () => {
    const before = await snapshot();
    const result = await changeMasterPasswordAction({
      ...(await currentVerifier()),
      newSalt: JUNK_SALT,
      newVerificationBlob: JUNK_BLOB,
      newVerificationIv: JUNK_IV,
      items: [],
    });
    expect(result).toEqual({ error: VAULT_CHANGED_ERROR });
    expect(await snapshot()).toEqual(before);
  });
});

describe("changeMasterPassword: browser flow end to end", () => {
  async function decryptAllWith(password: string) {
    const meta = await db.vaultMeta.findUniqueOrThrow({ where: { userId } });
    const key = await deriveVaultKey(password, fromBase64(meta.salt));
    const items = await db.vaultItem.findMany({ where: { userId }, orderBy: { name: "asc" } });
    return Promise.all(items.map((i) => decryptItem(key, { ciphertext: i.ciphertext, iv: i.iv })));
  }

  it("re-keys every item so only the new password opens the vault (happy path)", async () => {
    expect(await changeMasterPassword(OLD_PASSWORD, NEW_PASSWORD)).toEqual({ ok: true });

    expect(await decryptAllWith(NEW_PASSWORD)).toEqual([{ secret: "alpha" }, { secret: "bravo" }]);
    await expect(decryptAllWith(OLD_PASSWORD)).rejects.toThrow();
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

  it("retries once when an item is added mid-change, and keeps the new item readable", async () => {
    afterItemsFetched.hook = async () => {
      const { ciphertext, iv } = await encryptItem(oldKey, { secret: "charlie" });
      await db.vaultItem.create({
        data: { userId, type: "LOGIN", name: "charlie", ciphertext, iv },
      });
    };

    expect(await changeMasterPassword(OLD_PASSWORD, NEW_PASSWORD)).toEqual({ ok: true });
    expect(await decryptAllWith(NEW_PASSWORD)).toEqual([
      { secret: "alpha" },
      { secret: "bravo" },
      { secret: "charlie" },
    ]);
  });
});
