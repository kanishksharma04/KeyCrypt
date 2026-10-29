import {
  getVaultKey,
  setVaultKey,
  deriveVaultKey,
  generateSalt,
  createVerificationBlob,
  verifyVaultKey,
  encryptItem,
  decryptItem,
  toBase64,
  fromBase64,
} from "@/lib/crypto";
import { VAULT_CHANGED_ERROR } from "@/lib/action-errors";
import { getVaultMetaAction } from "@/server/vault-actions";
import {
  getAllItemsForReEncryptionAction,
  changeMasterPasswordAction,
} from "@/server/settings-actions";

export type ChangeMasterPasswordResult = { ok: true } | { ok: false; error: string };

/**
 * Re-key the whole vault under a new master password. Runs in the browser:
 * the server only ever receives the new salt, verifier and ciphertexts.
 *
 * If the vault changes while this runs (an item added in another tab, say),
 * the server rejects the update atomically and the whole flow is retried once.
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

  // 1. Read the current verifier and check the current master password against it.
  const meta = await getVaultMetaAction();
  if (!meta) return { ok: false, error: "Failed to load vault data." };

  const currentKey = await deriveVaultKey(currentPassword, fromBase64(meta.salt));
  const isValid = await verifyVaultKey(currentKey, {
    ciphertext: meta.verificationBlob,
    iv: meta.verificationIv,
  });
  if (!isValid) return { ok: false, error: "Current master password is incorrect." };

  // 2. Fetch every item (ciphertext only).
  const itemsResult = await getAllItemsForReEncryptionAction();
  if ("error" in itemsResult) return { ok: false, error: itemsResult.error };

  // 3. Derive the new key from the new password and a fresh salt.
  const newSaltBytes = generateSalt();
  const newKey = await deriveVaultKey(newPassword, newSaltBytes);

  // 4. Re-encrypt every item. Decrypt with the key just verified against the
  //    server's current verifier, not a possibly stale in-memory key.
  const items = await Promise.all(
    itemsResult.map(async (item) => {
      const plaintext = await decryptItem<unknown>(currentKey, {
        ciphertext: item.ciphertext,
        iv: item.iv,
      });
      const { ciphertext, iv } = await encryptItem(newKey, plaintext);
      return { id: item.id, ciphertext, iv };
    })
  );

  // 5. New verifier under the new key.
  const newBlob = await createVerificationBlob(newKey);

  // 6. Persist atomically. The server checks the verifier we read in step 1 and
  //    that `items` is exactly the current item set.
  const result = await changeMasterPasswordAction({
    currentVerificationBlob: meta.verificationBlob,
    currentVerificationIv: meta.verificationIv,
    newSalt: toBase64(newSaltBytes),
    newVerificationBlob: newBlob.ciphertext,
    newVerificationIv: newBlob.iv,
    items,
  });
  if (result.error) return { ok: false, error: result.error };

  // 7. Swap the in-memory key; the user stays unlocked.
  setVaultKey(newKey);
  return { ok: true };
}
