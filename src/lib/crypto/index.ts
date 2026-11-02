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

export { itemAad, generateItemId } from "./aad";

export {
  generateTotpSecret,
  totpProvisioningUri,
  generateTotpCode,
  verifyTotpCode,
  generateBackupCodes,
  normalizeBackupCode,
  encryptTotpSecret,
  decryptTotpSecret,
  TotpKeyError,
  TOTP_ISSUER,
} from "./totp";

export {
  generateRecoveryKey,
  parseRecoveryKey,
  formatRecoveryKey,
  deriveRecoveryKek,
  RecoveryKeyFormatError,
  RECOVERY_KEY_BYTES,
} from "./recovery";
export type { ItemAadContext } from "./aad";

export {
  generateVaultKey,
  wrapVaultKey,
  unwrapVaultKey,
  VaultKeyUnwrapError,
} from "./key-wrapping";

export {
  deriveKek,
  parseKdfConfig,
  KdfConfigError,
  DEFAULT_ARGON2ID_PARAMS,
  DEFAULT_KDF_CONFIG,
  KDF_LIMITS,
} from "./kdf";
export type { KdfConfig, Argon2idParams, Pbkdf2Params } from "./kdf";
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
export {
  loadPasswordStrengthEstimator,
  isPasswordStrengthEstimatorLoaded,
} from "./password-strength";

export { countPasswordBreaches, sha1Hex, BreachCheckError, PWNED_PASSWORDS_ORIGIN } from "./breach";
