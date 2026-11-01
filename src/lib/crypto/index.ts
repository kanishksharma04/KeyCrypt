// Public API for lib/crypto — import everything from here, never from sub-modules
// directly (keeps the auditable surface small).

export type { EncryptedPayload } from "./types";

export {
  generateSalt,
  generateIv,
  deriveVaultKey,
  PBKDF2_ITERATIONS,
  SALT_LENGTH,
  IV_LENGTH,
} from "./key-derivation";

export { encryptItem, decryptItem } from "./encryption";

export {
  generateVaultKey,
  deriveKek,
  wrapVaultKey,
  unwrapVaultKey,
  VaultKeyUnwrapError,
} from "./key-wrapping";
export type { WrappedVaultKey } from "./key-wrapping";

export { createVerificationBlob, verifyVaultKey } from "./verification";

export { setVaultKey, getVaultKey, clearVaultKey, isVaultUnlocked } from "./vault-key";

export { toBase64, fromBase64, bufferToBase64, stringToBytes, bytesToString } from "./utils";

export { hmacSign, hmacVerify } from "./hmac";

export {
  encryptExport,
  decryptExport,
  ExportDecryptionError,
  EXPORT_FORMAT,
  EXPORT_VERSION,
} from "./export";
export type { EncryptedExportFile } from "./export";

export {
  generatePassword,
  getPasswordStrength,
  estimatePasswordStrength,
  DEFAULT_PASSWORD_OPTIONS,
} from "./password-generator";

export type { PasswordOptions, PasswordStrength } from "./password-generator";
