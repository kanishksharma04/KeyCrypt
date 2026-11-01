import {
  DEFAULT_ARGON2ID_PARAMS,
  DEFAULT_KDF_CONFIG,
  parseKdfConfig,
  deriveKek,
  fromBase64,
  generateSalt,
  getVaultKey,
  setVaultKey,
  toBase64,
  unwrapVaultKey,
  VaultKeyUnwrapError,
  wrapVaultKey,
} from "@/lib/crypto";
import { VAULT_CHANGED_ERROR } from "@/lib/action-errors";
import { getVaultMetaAction } from "@/server/vault-actions";
import { changeMasterPasswordAction } from "@/server/settings-actions";

export type ChangeMasterPasswordResult = { ok: true } | { ok: false; error: string };

/**
 * Change the master password (crypto v2). Runs in the browser: unwrap the vault
 * key with the current password, re-wrap the SAME key under a KEK from the new
 * password. Items are not touched. The server only receives the new salt and
 * wrapped key.
 *
 * Retries once if the wrapped key changed meanwhile (e.g. another tab).
 */
export async function changeMasterPassword(
  currentPassword: string,
  newPassword: string
): Promise<ChangeMasterPasswordResult> {
  const first = await attemptChange(currentPassword, newPassword);
  if (first.ok || first.error !== VAULT_CHANGED_ERROR) return first;
  return attemptChange(currentPassword, newPassword); // one automatic retry
}

async function attemptChange(
  currentPassword: string,
  newPassword: string
): Promise<ChangeMasterPasswordResult> {
  if (!getVaultKey()) return { ok: false, error: "Vault is locked. Please unlock and try again." };

  const meta = await getVaultMetaAction();
  if (!meta) return { ok: false, error: "Failed to load vault data." };
  if (meta.cryptoVersion !== 2 || !meta.wrappedVaultKey || !meta.wrapIv) {
    return { ok: false, error: "Lock and unlock your vault to finish its upgrade first." };
  }
  const current = { wrappedKey: meta.wrappedVaultKey, iv: meta.wrapIv };

  // 1. Unwrap with the current password. A short-lived EXTRACTABLE copy is
  //    needed to re-wrap; it is dropped when this function returns.
  let extractableCopy: CryptoKey;
  try {
    const currentKek = await deriveKek(
      currentPassword,
      fromBase64(meta.salt),
      parseKdfConfig(meta.kdf, meta.kdfParams)
    );
    extractableCopy = await unwrapVaultKey(current, currentKek, { extractable: true });
  } catch (e) {
    if (e instanceof VaultKeyUnwrapError) {
      return { ok: false, error: "Current master password is incorrect." };
    }
    throw e;
  }

  // 2. Re-wrap under a KEK from the new password and a fresh salt.
  const newSalt = generateSalt();
  const newKek = await deriveKek(newPassword, newSalt, DEFAULT_KDF_CONFIG); // Argon2id
  const rewrapped = await wrapVaultKey(extractableCopy, newKek);

  // 3. Persist. The server checks we read the current wrapped key.
  const result = await changeMasterPasswordAction({
    currentWrappedVaultKey: current.wrappedKey,
    currentWrapIv: current.iv,
    kdf: "argon2id",
    kdfParams: DEFAULT_ARGON2ID_PARAMS,
    newSalt: toBase64(newSalt),
    newWrappedVaultKey: rewrapped.wrappedKey,
    newWrapIv: rewrapped.iv,
  });
  if (result.error) return { ok: false, error: result.error };

  // 4. Same vault key, so items stay readable; keep a non-extractable copy.
  setVaultKey(await unwrapVaultKey(rewrapped, newKek));
  return { ok: true };
}
