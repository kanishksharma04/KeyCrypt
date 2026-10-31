import {
  deriveVaultKey,
  generateSalt,
  PBKDF2_ITERATIONS,
  SALT_LENGTH,
  IV_LENGTH,
} from "./key-derivation";
import { encryptItem, decryptItem } from "./encryption";
import { toBase64, fromBase64 } from "./utils";

// Password-protected vault export ("keycrypt-export" v1).
//
// The browser decrypts every item with the vault key, then encrypts the whole
// payload under a key derived from a separate EXPORT password:
//   key  = PBKDF2-SHA-256(exportPassword, fresh 16-byte salt, iterations)
//   file = AES-256-GCM(key, fresh 12-byte IV, JSON(payload))
// The file is self-describing so it can be decrypted without KeyCrypt's server.

export const EXPORT_FORMAT = "keycrypt-export" as const;
export const EXPORT_VERSION = 1 as const;

/** Upper bound accepted when DEcrypting, so a crafted file can't stall the browser. */
const MAX_IMPORT_ITERATIONS = 10_000_000;

export interface EncryptedExportFile {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number };
  /** Base64, 16 bytes. */
  salt: string;
  /** Base64, 12 bytes. */
  iv: string;
  /** Base64 AES-256-GCM ciphertext (with tag) of the JSON payload. */
  ciphertext: string;
}

/** Thrown when an export file can't be opened: wrong password or damaged file. */
export class ExportDecryptionError extends Error {
  constructor(message = "Wrong export password, or the file is damaged.") {
    super(message);
    this.name = "ExportDecryptionError";
  }
}

/**
 * Encrypt `payload` (any JSON-serialisable value) under `exportPassword`.
 * A fresh salt and IV are generated for every call.
 *
 * @param iterations PBKDF2 iterations (override only in tests)
 */
export async function encryptExport(
  payload: unknown,
  exportPassword: string,
  iterations: number = PBKDF2_ITERATIONS
): Promise<EncryptedExportFile> {
  const salt = generateSalt();
  const key = await deriveVaultKey(exportPassword, salt, iterations);
  const { ciphertext, iv } = await encryptItem(key, payload);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations },
    salt: toBase64(salt),
    iv,
    ciphertext,
  };
}

/** Validate an untrusted parsed export file. Throws ExportDecryptionError if malformed. */
function parseExportFile(file: unknown): EncryptedExportFile {
  const f = file as Partial<EncryptedExportFile> | null;
  const ok =
    !!f &&
    typeof f === "object" &&
    f.format === EXPORT_FORMAT &&
    f.version === EXPORT_VERSION &&
    f.kdf?.name === "PBKDF2" &&
    f.kdf.hash === "SHA-256" &&
    Number.isInteger(f.kdf.iterations) &&
    f.kdf.iterations >= 1 &&
    f.kdf.iterations <= MAX_IMPORT_ITERATIONS &&
    typeof f.salt === "string" &&
    typeof f.iv === "string" &&
    typeof f.ciphertext === "string";
  if (!ok)
    throw new ExportDecryptionError("Not a KeyCrypt export file, or an unsupported version.");

  let saltLen: number;
  let ivLen: number;
  try {
    saltLen = fromBase64(f.salt!).byteLength;
    ivLen = fromBase64(f.iv!).byteLength;
  } catch {
    throw new ExportDecryptionError("The export file is damaged.");
  }
  if (saltLen !== SALT_LENGTH || ivLen !== IV_LENGTH) {
    throw new ExportDecryptionError("The export file is damaged.");
  }
  return f as EncryptedExportFile;
}

/**
 * Decrypt an export file (already JSON-parsed) with its export password.
 * Throws ExportDecryptionError for a wrong password, tampering or a bad file.
 */
export async function decryptExport<T = unknown>(
  file: unknown,
  exportPassword: string
): Promise<T> {
  const parsed = parseExportFile(file);
  const key = await deriveVaultKey(exportPassword, fromBase64(parsed.salt), parsed.kdf.iterations);
  try {
    return await decryptItem<T>(key, { ciphertext: parsed.ciphertext, iv: parsed.iv });
  } catch {
    // AES-GCM tag mismatch: wrong password or modified ciphertext.
    throw new ExportDecryptionError();
  }
}
