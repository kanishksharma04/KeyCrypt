import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearVaultKey, generateItemId, generateRecoveryKey, setVaultKey } from "@/lib/crypto";
import { db } from "@/lib/db";
import { REAUTH_REQUIRED_ERROR, VAULT_CHANGED_ERROR } from "@/lib/action-errors";
import {
  recoverVaultAction,
  setupVaultAction,
  type VaultMetaForUnlock,
} from "@/server/vault-actions";
import {
  checkRecoveryKey,
  createRecoveryKit,
  createVaultKeys,
  resetMasterPasswordWithRecoveryKey,
  unlockVault,
} from "@/features/vault/vault-crypto";
import { openItem, sealItem } from "@/features/vault/item-payload";
import {
  clearTestCookies,
  createTestUser,
  grantRecentReauth,
  signInAs,
} from "@/test/integration/helpers";

// Fast KDFs for tests; all other crypto is real.
vi.mock("@/lib/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crypto")>();
  const { FAST_TEST_KDF } = await import("@/test/fast-kdf");
  return {
    ...actual,
    deriveKek: (pw: string, salt: Uint8Array<ArrayBuffer>) =>
      actual.deriveKek(pw, salt, FAST_TEST_KDF),
  };
});

const FORGOTTEN = "Forgotten-Master-Pass-1!";
const NEW_PASSWORD = "Brand-New-Master-Pass-2!";

let userId: string;
let recoveryKeyText: string;

async function meta(): Promise<VaultMetaForUnlock> {
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

async function itemsOpenWith(password: string) {
  const unlocked = await unlockVault(password, await meta());
  if (unlocked.status !== "unlocked") return unlocked.status;
  const rows = await db.vaultItem.findMany({ where: { userId }, orderBy: { id: "asc" } });
  return Promise.all(rows.map((r) => openItem(unlocked.vaultKey, r, userId)));
}

beforeEach(async () => {
  clearVaultKey();
  const user = await createTestUser();
  userId = user.id;
  signInAs(user);
  await grantRecentReauth(user.id);

  // A new v2 vault, created through the real setup action, with one item.
  const created = await createVaultKeys(FORGOTTEN, userId);
  recoveryKeyText = created.recoveryKeyText;
  expect(await setupVaultAction(created.setup)).toBeNull();
  const id = generateItemId();
  const sealed = await sealItem(
    created.vaultKey,
    { id, type: "LOGIN", name: "GitHub", secret: { password: "s3cret" } },
    userId
  );
  await db.vaultItem.create({ data: { id, userId, type: "LOGIN", name: null, ...sealed } });
});

describe("recovery kit at setup", () => {
  it("stores a recovery wrap and logs vault.recovery.created", async () => {
    const m = await meta();
    expect(m.recoveryWrappedKey).toHaveLength(64);
    expect(m.recoveryCreatedAt).not.toBeNull();
    expect(recoveryKeyText).toMatch(/^([A-Z2-7]{4}-){6}[A-Z2-7]{2}$/);
    expect(await db.auditLog.count({ where: { userId, action: "vault.recovery.created" } })).toBe(
      1
    );
  });
});

describe("forgotten master password", () => {
  it("unlocks with the recovery key and sets a new master password", async () => {
    const itemsBefore = await db.vaultItem.findMany({ where: { userId } });

    expect(await checkRecoveryKey(recoveryKeyText, await meta(), userId)).toEqual({ ok: true });
    const result = await resetMasterPasswordWithRecoveryKey(
      recoveryKeyText.toLowerCase().replace(/-/g, " "), // as typed: case/spacing don't matter
      NEW_PASSWORD,
      await meta(),
      userId
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.vaultKey.extractable).toBe(false);
    setVaultKey(result.vaultKey);

    // The new password opens the same vault; items were not touched.
    expect(await itemsOpenWith(NEW_PASSWORD)).toEqual([
      { name: "GitHub", secret: { password: "s3cret" } },
    ]);
    expect(await db.vaultItem.findMany({ where: { userId } })).toEqual(itemsBefore);
    expect(await itemsOpenWith(FORGOTTEN)).toBe("wrong-password");
    // The recovery key keeps working.
    expect(await checkRecoveryKey(recoveryKeyText, await meta(), userId)).toEqual({ ok: true });
    expect(await db.auditLog.count({ where: { userId, action: "vault.recovery.used" } })).toBe(1);
  });

  it("rejects a wrong or malformed recovery key", async () => {
    expect(await checkRecoveryKey(generateRecoveryKey().text, await meta(), userId)).toEqual({
      ok: false,
      error: "That recovery key doesn't unlock this vault.",
    });
    expect(await checkRecoveryKey("not a key", await meta(), userId)).toEqual({
      ok: false,
      error: "That doesn't look like a recovery key.",
    });
    const before = await meta();
    const result = await resetMasterPasswordWithRecoveryKey(
      generateRecoveryKey().text,
      NEW_PASSWORD,
      before,
      userId
    );
    expect(result.ok).toBe(false);
    expect(await meta()).toEqual(before);
  });
});

describe("recoverVaultAction", () => {
  const forged = (current: VaultMetaForUnlock) => ({
    currentRecoveryWrappedKey: current.recoveryWrappedKey!,
    currentRecoveryIv: current.recoveryIv!,
    kdf: "argon2id" as const,
    kdfParams: { memoryKiB: 65_536, iterations: 3, parallelism: 1, hashLength: 32 as const },
    newSalt: "AAAAAAAAAAAAAAAAAAAAAA==",
    newWrappedVaultKey: "J".repeat(64),
    newWrapIv: "AAAAAAAAAAAAAAAA",
  });

  it("requires a recent account-password confirmation", async () => {
    clearTestCookies();
    const before = await meta();
    expect(await recoverVaultAction(forged(before))).toEqual({ error: REAUTH_REQUIRED_ERROR });
    expect(await meta()).toEqual(before);
  });

  it("rejects a stale recovery wrap", async () => {
    const before = await meta();
    const stale = { ...forged(before), currentRecoveryWrappedKey: "S".repeat(64) };
    expect(await recoverVaultAction(stale)).toEqual({ error: VAULT_CHANGED_ERROR });
    expect(await meta()).toEqual(before);
  });
});

describe("regenerating the recovery key (Settings)", () => {
  it("replaces the old key: the new one works, the old one stops working", async () => {
    const result = await createRecoveryKit(FORGOTTEN, userId);
    if (!result.ok) throw new Error(result.error);
    expect(result.recoveryKeyText).not.toBe(recoveryKeyText);

    expect(await checkRecoveryKey(result.recoveryKeyText, await meta(), userId)).toEqual({
      ok: true,
    });
    expect((await checkRecoveryKey(recoveryKeyText, await meta(), userId)).ok).toBe(false);
    expect(await db.auditLog.count({ where: { userId, action: "vault.recovery.created" } })).toBe(
      2
    );
  });

  it("needs the right master password and a recent confirmation", async () => {
    const before = await meta();
    expect(await createRecoveryKit("Wrong-Master-Pass-9!", userId)).toEqual({
      ok: false,
      error: "Incorrect master password.",
    });
    clearTestCookies();
    expect(await createRecoveryKit(FORGOTTEN, userId)).toEqual({
      ok: false,
      error: REAUTH_REQUIRED_ERROR,
    });
    expect(await meta()).toEqual(before);
  });
});
