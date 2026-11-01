import {
  DEFAULT_ARGON2ID_PARAMS,
  DEFAULT_KDF_CONFIG,
  parseKdfConfig,
  createVerificationBlob,
  deriveRecoveryKek,
  generateRecoveryKey,
  parseRecoveryKey,
  RecoveryKeyFormatError,
  decryptItem,
  deriveKek,
  deriveVaultKey,
  fromBase64,
  generateSalt,
  generateVaultKey,
  toBase64,
  unwrapVaultKey,
  verifyVaultKey,
  VaultKeyUnwrapError,
  wrapVaultKey,
} from "@/lib/crypto";
import { VAULT_CHANGED_ERROR } from "@/lib/action-errors";
import {
  getVaultMetaAction,
  recoverVaultAction,
  setRecoveryKeyAction,
  upgradeVaultAction,
  type VaultMetaForUnlock,
} from "@/server/vault-actions";
import { getAllItemsForReEncryptionAction } from "@/server/settings-actions";
import { sealItem } from "./item-payload";

// Browser-side vault key flows (crypto v2). The master password, the vault key
// and decrypted items never leave this code; the server only stores salts,
// wrapped keys, verifiers and ciphertext.

// ─── Create (setup) ──────────────────────────────────────────────────────────

/**
 * Create a v2 vault: a random vault key wrapped under the master-password KEK
 * (Argon2id), and again under a recovery-key KEK (recovery kit). Returns what
 * setupVaultAction stores, the recovery key to show the user ONCE, and the
 * NON-extractable vault key to keep in memory.
 */
export async function createVaultKeys(masterPassword: string, userId: string) {
  const salt = generateSalt();
  const kek = await deriveKek(masterPassword, salt, DEFAULT_KDF_CONFIG); // Argon2id
  const generated = await generateVaultKey(); // extractable: used only to wrap
  const wrapped = await wrapVaultKey(generated, kek);

  const recoveryKey = generateRecoveryKey();
  const recoveryWrapped = await wrapVaultKey(
    generated,
    await deriveRecoveryKek(recoveryKey.bytes, userId)
  );

  // Keep only a non-extractable copy in memory.
  const vaultKey = await unwrapVaultKey(wrapped, kek);
  const verifier = await createVerificationBlob(vaultKey);

  return {
    vaultKey,
    recoveryKeyText: recoveryKey.text,
    setup: {
      kdf: "argon2id" as const,
      kdfParams: DEFAULT_ARGON2ID_PARAMS,
      salt: toBase64(salt),
      wrappedVaultKey: wrapped.wrappedKey,
      wrapIv: wrapped.iv,
      verificationBlob: verifier.ciphertext,
      verificationIv: verifier.iv,
      recoveryWrappedKey: recoveryWrapped.wrappedKey,
      recoveryIv: recoveryWrapped.iv,
    },
  };
}

// ─── Unlock ──────────────────────────────────────────────────────────────────

export type UnlockResult =
  | { status: "unlocked"; vaultKey: CryptoKey }
  | { status: "needs-upgrade"; v1Key: CryptoKey }
  | { status: "wrong-password" };

/** Derive the vault key from the master password. v1 vaults need an upgrade before use. */
export async function unlockVault(
  masterPassword: string,
  meta: VaultMetaForUnlock
): Promise<UnlockResult> {
  const salt = fromBase64(meta.salt);
  const verifier = { ciphertext: meta.verificationBlob, iv: meta.verificationIv };

  if (meta.cryptoVersion === 2) {
    if (!meta.wrappedVaultKey || !meta.wrapIv) throw new Error("Vault key material is missing.");
    // Validated before use, so a tampered row can't make the browser hang or OOM.
    const kek = await deriveKek(masterPassword, salt, parseKdfConfig(meta.kdf, meta.kdfParams));
    let vaultKey: CryptoKey;
    try {
      vaultKey = await unwrapVaultKey({ wrappedKey: meta.wrappedVaultKey, iv: meta.wrapIv }, kek);
    } catch (e) {
      if (e instanceof VaultKeyUnwrapError) return { status: "wrong-password" };
      throw e;
    }
    // Sanity check: the unwrapped key is this vault's key.
    if (!(await verifyVaultKey(vaultKey, verifier))) return { status: "wrong-password" };
    return { status: "unlocked", vaultKey };
  }

  // v1: vaultKey = PBKDF2(masterPassword, salt)
  const v1Key = await deriveVaultKey(masterPassword, salt);
  if (!(await verifyVaultKey(v1Key, verifier))) return { status: "wrong-password" };
  return { status: "needs-upgrade", v1Key };
}

// ─── v1 → v2 upgrade ─────────────────────────────────────────────────────────

export type UpgradeResult = { ok: true; vaultKey: CryptoKey } | { ok: false; error: string };

/**
 * Re-encrypt every item under a new random vault key and wrap that key under a
 * KEK from the same master password. Saved atomically by upgradeVaultAction,
 * which requires a recent account-password confirmation. Retries once if the
 * vault changed meanwhile.
 */
export async function upgradeVaultToV2(
  masterPassword: string,
  v1Key: CryptoKey,
  userId: string
): Promise<UpgradeResult> {
  const first = await attemptUpgrade(masterPassword, v1Key, userId);
  if (first.ok || first.error !== VAULT_CHANGED_ERROR) return first;
  return attemptUpgrade(masterPassword, v1Key, userId);
}

async function attemptUpgrade(
  masterPassword: string,
  v1Key: CryptoKey,
  userId: string
): Promise<UpgradeResult> {
  const meta = await getVaultMetaAction();
  if (!meta) return { ok: false, error: "Failed to load vault data." };
  if (meta.cryptoVersion !== 1) return { ok: false, error: "This vault is already upgraded." };

  const rows = await getAllItemsForReEncryptionAction();
  if ("error" in rows) return { ok: false, error: rows.error };

  const salt = generateSalt();
  const kek = await deriveKek(masterPassword, salt, DEFAULT_KDF_CONFIG); // upgrade → Argon2id
  const newKey = await generateVaultKey();

  const items = await Promise.all(
    rows.map(async (row) => {
      // v1 items: secret-only payload, no AAD, plain-text name in the row.
      const secret = await decryptItem<unknown>(v1Key, {
        ciphertext: row.ciphertext,
        iv: row.iv,
      });
      // v2: the name moves inside the ciphertext (the server clears the column
      // in the same transaction) and the item is bound to its row with AAD.
      const { ciphertext, iv } = await sealItem(
        newKey,
        { id: row.id, type: row.type, name: row.name ?? "", secret },
        userId
      );
      return { id: row.id, ciphertext, iv };
    })
  );

  const wrapped = await wrapVaultKey(newKey, kek);
  const vaultKey = await unwrapVaultKey(wrapped, kek); // non-extractable copy for memory
  const verifier = await createVerificationBlob(vaultKey);

  const result = await upgradeVaultAction({
    currentVerificationBlob: meta.verificationBlob,
    currentVerificationIv: meta.verificationIv,
    kdf: "argon2id",
    kdfParams: DEFAULT_ARGON2ID_PARAMS,
    newSalt: toBase64(salt),
    wrappedVaultKey: wrapped.wrappedKey,
    wrapIv: wrapped.iv,
    newVerificationBlob: verifier.ciphertext,
    newVerificationIv: verifier.iv,
    items,
  });
  if (result.error) return { ok: false, error: result.error };
  return { ok: true, vaultKey };
}

// ─── Recovery kit ────────────────────────────────────────────────────────────

export type RecoveryResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Create (or replace) the recovery kit from Settings. Needs the master password
 * to unwrap a short-lived extractable copy of the vault key; the server needs a
 * recent account-password confirmation. Returns the new key to show ONCE.
 */
export async function createRecoveryKit(
  masterPassword: string,
  userId: string
): Promise<RecoveryResult<{ recoveryKeyText: string }>> {
  const meta = await getVaultMetaAction();
  if (!meta || meta.cryptoVersion !== 2 || !meta.wrappedVaultKey || !meta.wrapIv) {
    return { ok: false, error: "Lock and unlock your vault to finish its upgrade first." };
  }
  const current = { wrappedKey: meta.wrappedVaultKey, iv: meta.wrapIv };

  let extractableCopy: CryptoKey;
  try {
    const kek = await deriveKek(
      masterPassword,
      fromBase64(meta.salt),
      parseKdfConfig(meta.kdf, meta.kdfParams)
    );
    extractableCopy = await unwrapVaultKey(current, kek, { extractable: true });
  } catch (e) {
    if (e instanceof VaultKeyUnwrapError) return { ok: false, error: "Incorrect master password." };
    throw e;
  }

  const recoveryKey = generateRecoveryKey();
  const wrapped = await wrapVaultKey(
    extractableCopy,
    await deriveRecoveryKek(recoveryKey.bytes, userId)
  );
  const result = await setRecoveryKeyAction({
    currentWrappedVaultKey: current.wrappedKey,
    currentWrapIv: current.iv,
    recoveryWrappedKey: wrapped.wrappedKey,
    recoveryIv: wrapped.iv,
  });
  if (result.error) return { ok: false, error: result.error };
  return { ok: true, recoveryKeyText: recoveryKey.text };
}

const WRONG_RECOVERY_KEY = "That recovery key doesn't unlock this vault.";

async function unwrapWithRecoveryKey(
  recoveryKeyText: string,
  meta: VaultMetaForUnlock,
  userId: string,
  extractable: boolean
): Promise<CryptoKey | string> {
  if (!meta.recoveryWrappedKey || !meta.recoveryIv) {
    return "This vault has no recovery key.";
  }
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = parseRecoveryKey(recoveryKeyText);
  } catch (e) {
    if (e instanceof RecoveryKeyFormatError) return e.message;
    throw e;
  }
  try {
    return await unwrapVaultKey(
      { wrappedKey: meta.recoveryWrappedKey, iv: meta.recoveryIv },
      await deriveRecoveryKek(bytes, userId),
      { extractable }
    );
  } catch (e) {
    if (e instanceof VaultKeyUnwrapError) return WRONG_RECOVERY_KEY;
    throw e;
  }
}

/** Step 1 on the unlock page: does this recovery key open the vault? */
export async function checkRecoveryKey(
  recoveryKeyText: string,
  meta: VaultMetaForUnlock,
  userId: string
): Promise<RecoveryResult> {
  const key = await unwrapWithRecoveryKey(recoveryKeyText, meta, userId, false);
  return typeof key === "string" ? { ok: false, error: key } : { ok: true };
}

/**
 * Step 2: unwrap with the recovery key and re-wrap the same vault key under a
 * KEK from the NEW master password. Saved by recoverVaultAction (needs a recent
 * account-password confirmation). Returns the non-extractable key for memory.
 */
export async function resetMasterPasswordWithRecoveryKey(
  recoveryKeyText: string,
  newMasterPassword: string,
  meta: VaultMetaForUnlock,
  userId: string
): Promise<RecoveryResult<{ vaultKey: CryptoKey }>> {
  const extractableCopy = await unwrapWithRecoveryKey(recoveryKeyText, meta, userId, true);
  if (typeof extractableCopy === "string") return { ok: false, error: extractableCopy };

  const salt = generateSalt();
  const kek = await deriveKek(newMasterPassword, salt, DEFAULT_KDF_CONFIG); // Argon2id
  const wrapped = await wrapVaultKey(extractableCopy, kek);

  const result = await recoverVaultAction({
    currentRecoveryWrappedKey: meta.recoveryWrappedKey!,
    currentRecoveryIv: meta.recoveryIv!,
    kdf: "argon2id",
    kdfParams: DEFAULT_ARGON2ID_PARAMS,
    newSalt: toBase64(salt),
    newWrappedVaultKey: wrapped.wrappedKey,
    newWrapIv: wrapped.iv,
  });
  if (result.error) return { ok: false, error: result.error };
  return { ok: true, vaultKey: await unwrapVaultKey(wrapped, kek) };
}
