import { deriveVaultKey, generateSalt, SALT_LENGTH, IV_LENGTH } from "./key-derivation";
import {
  DEFAULT_ARGON2ID_PARAMS,
  deriveArgon2idEncryptionKey,
  KdfConfigError,
  parseKdfConfig,
  type Argon2idParams,
} from "./kdf";
import { encryptItem, decryptItem } from "./encryption";
import { toBase64, fromBase64 } from "./utils";

// Password-protected vault export ("keycrypt-export").
//
// The browser decrypts every item with the vault key, then encrypts the whole
// payload under a key derived from a separate EXPORT password:
//   v2 (written today):
//     key  = Argon2id(exportPassword, fresh 16-byte salt, 64 MiB, 3 iterations, parallelism 1)
//   v1 (read only, files written before 2026-11-09):
//     key  = PBKDF2-SHA-256(exportPassword, fresh 16-byte salt, iterations)
//   file = AES-256-GCM(key, fresh 12-byte IV, JSON(payload))
// The file is self-describing (KDF and its parameters in the header) so it can
// be decrypted without KeyCrypt's server. Argon2id parameters read from a file
// are bounds-checked with the vault KDF limits (KDF_LIMITS) before deriving.

export const EXPORT_FORMAT = "keycrypt-export" as const;
/** The version new exports are written in. */
export const EXPORT_VERSION = 2 as const;

/** Upper bound for v1 PBKDF2 iterations, so a crafted file can't stall the browser. */
const MAX_V1_ITERATIONS = 10_000_000;

interface ExportFileBase {
  format: typeof EXPORT_FORMAT;
  /** Base64, 16 bytes. */
  salt: string;
  /** Base64, 12 bytes. */
  iv: string;
  /** Base64 AES-256-GCM ciphertext (with tag) of the JSON payload. */
  ciphertext: string;
}

/** v2: Argon2id. What encryptExport writes. */
export interface EncryptedExportFile extends ExportFileBase {
  version: 2;
  kdf: { name: "argon2id"; memoryKiB: number; iterations: number; parallelism: number };
}

/** v1: PBKDF2-SHA-256. Still accepted by decryptExport. */
export interface EncryptedExportFileV1 extends ExportFileBase {
  version: 1;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number };
}

/** Thrown when an export file can't be opened: wrong password or damaged file. */
export class ExportDecryptionError extends Error {
  constructor(message = "Wrong export password, or the file is damaged.") {
    super(message);
    this.name = "ExportDecryptionError";
  }
}

const UNSUPPORTED = "Not a KeyCrypt export file, or an unsupported version.";

/** Bounds-check Argon2id parameters with the vault KDF limits. */
function checkedArgon2idParams(p: {
  memoryKiB?: unknown;
  iterations?: unknown;
  parallelism?: unknown;
}): Argon2idParams {
  try {
    const config = parseKdfConfig("argon2id", {
      memoryKiB: p.memoryKiB,
      iterations: p.iterations,
      parallelism: p.parallelism,
      hashLength: 32,
    });
    if (config.kdf !== "argon2id") throw new KdfConfigError();
    return config.params;
  } catch {
    throw new ExportDecryptionError("The export file has unsupported key-derivation settings.");
  }
}

/**
 * Encrypt `payload` (any JSON-serialisable value) under `exportPassword`
 * (format v2, Argon2id). A fresh salt and IV are generated for every call.
 *
 * @param params Argon2id parameters (override only in tests; must be within KDF_LIMITS)
 */
export async function encryptExport(
  payload: unknown,
  exportPassword: string,
  params: Argon2idParams = DEFAULT_ARGON2ID_PARAMS
): Promise<EncryptedExportFile> {
  const checked = checkedArgon2idParams(params);
  const salt = generateSalt();
  const key = await deriveArgon2idEncryptionKey(exportPassword, salt, checked);
  const { ciphertext, iv } = await encryptItem(key, payload);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    kdf: {
      name: "argon2id",
      memoryKiB: checked.memoryKiB,
      iterations: checked.iterations,
      parallelism: checked.parallelism,
    },
    salt: toBase64(salt),
    iv,
    ciphertext,
  };
}

type ParsedExport =
  | { file: EncryptedExportFileV1; deriveKey: (password: string) => Promise<CryptoKey> }
  | { file: EncryptedExportFile; deriveKey: (password: string) => Promise<CryptoKey> };

/**
 * Validate an untrusted parsed export file, including its KDF parameters, before
 * anything is derived. Throws ExportDecryptionError if malformed.
 */
function parseExportFile(file: unknown): ParsedExport {
  const f = file as Partial<EncryptedExportFile | EncryptedExportFileV1> | null;
  const base =
    !!f &&
    typeof f === "object" &&
    f.format === EXPORT_FORMAT &&
    typeof f.salt === "string" &&
    typeof f.iv === "string" &&
    typeof f.ciphertext === "string" &&
    !!f.kdf &&
    typeof f.kdf === "object";
  if (!base) throw new ExportDecryptionError(UNSUPPORTED);

  let salt: Uint8Array<ArrayBuffer>;
  let ivLen: number;
  try {
    salt = fromBase64(f.salt!);
    ivLen = fromBase64(f.iv!).byteLength;
  } catch {
    throw new ExportDecryptionError("The export file is damaged.");
  }
  if (salt.byteLength !== SALT_LENGTH || ivLen !== IV_LENGTH) {
    throw new ExportDecryptionError("The export file is damaged.");
  }

  if (f.version === 2) {
    const kdf = f.kdf as Partial<EncryptedExportFile["kdf"]>;
    if (kdf.name !== "argon2id") throw new ExportDecryptionError(UNSUPPORTED);
    const params = checkedArgon2idParams(kdf);
    return {
      file: f as EncryptedExportFile,
      deriveKey: (password) => deriveArgon2idEncryptionKey(password, salt, params),
    };
  }

  if (f.version === 1) {
    const kdf = f.kdf as Partial<EncryptedExportFileV1["kdf"]>;
    const iterations = kdf.iterations;
    if (
      kdf.name !== "PBKDF2" ||
      kdf.hash !== "SHA-256" ||
      typeof iterations !== "number" ||
      !Number.isInteger(iterations) ||
      iterations < 1 ||
      iterations > MAX_V1_ITERATIONS
    ) {
      throw new ExportDecryptionError(UNSUPPORTED);
    }
    return {
      file: f as EncryptedExportFileV1,
      deriveKey: (password) => deriveVaultKey(password, salt, iterations),
    };
  }

  throw new ExportDecryptionError(UNSUPPORTED);
}

/**
 * Decrypt an export file (already JSON-parsed, v1 or v2) with its export password.
 * Throws ExportDecryptionError for a wrong password, tampering or a bad file.
 */
export async function decryptExport<T = unknown>(
  file: unknown,
  exportPassword: string
): Promise<T> {
  const parsed = parseExportFile(file);
  const key = await parsed.deriveKey(exportPassword);
  try {
    return await decryptItem<T>(key, { ciphertext: parsed.file.ciphertext, iv: parsed.file.iv });
  } catch {
    // AES-GCM tag mismatch: wrong password or modified ciphertext.
    throw new ExportDecryptionError();
  }
}
