import {
  DEFAULT_ARGON2ID_PARAMS,
  DEFAULT_KDF_CONFIG,
  parseKdfConfig,
  createVerificationBlob,
  decryptItem,
  deriveKek,
  deriveVaultKey,
  encryptItem,
  itemAad,
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
  upgradeVaultAction,
  type VaultMetaForUnlock,
} from "@/server/vault-actions";
import { getAllItemsForReEncryptionAction } from "@/server/settings-actions";

// Browser-side vault key flows (crypto v2). The master password, the vault key
// and decrypted items never leave this code; the server only stores salts,
// wrapped keys, verifiers and ciphertext.

// ─── Create (setup) ──────────────────────────────────────────────────────────

/**
 * Create a v2 vault: a random vault key wrapped under the master-password KEK.
 * Returns what setupVaultAction stores, and the NON-extractable vault key to
 * keep in memory.
 */
export async function createVaultKeys(masterPassword: string) {
  const salt = generateSalt();
  const kek = await deriveKek(masterPassword, salt, DEFAULT_KDF_CONFIG); // Argon2id
  const generated = await generateVaultKey(); // extractable: used once, to wrap
  const wrapped = await wrapVaultKey(generated, kek);
  // Keep only a non-extractable copy in memory.
  const vaultKey = await unwrapVaultKey(wrapped, kek);
  const verifier = await createVerificationBlob(vaultKey);

  return {
    vaultKey,
    setup: {
      kdf: "argon2id" as const,
      kdfParams: DEFAULT_ARGON2ID_PARAMS,
      salt: toBase64(salt),
      wrappedVaultKey: wrapped.wrappedKey,
      wrapIv: wrapped.iv,
      verificationBlob: verifier.ciphertext,
      verificationIv: verifier.iv,
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
      // v1 items have no AAD; v2 binds each one to its row.
      const plaintext = await decryptItem<unknown>(v1Key, {
        ciphertext: row.ciphertext,
        iv: row.iv,
      });
      const { ciphertext, iv } = await encryptItem(
        newKey,
        plaintext,
        itemAad({ userId, itemId: row.id, type: row.type })
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
