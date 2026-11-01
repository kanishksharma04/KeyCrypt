import { argon2idRaw, type Argon2Request, type Argon2Response } from "./argon2";
import { PBKDF2_ITERATIONS } from "./key-derivation";
import { stringToBytes } from "./utils";

// Password KDFs for the v2 key-encryption key (KEK).
//
//   argon2id (default for every new or upgraded vault):
//     memory 64 MiB, 3 iterations, parallelism 1, 32-byte output
//   pbkdf2: read-only support for vaults written before Argon2id.
//
// Argon2id runs in a Web Worker (kdf.worker.ts) so the page stays responsive,
// falling back to the main thread where workers are unavailable (tests, old
// browsers) or fail to start. WebAssembly needs 'wasm-unsafe-eval' in the CSP.

export type Argon2idParams = {
  /** Memory in KiB. */
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  /** Output length in bytes (always 32: an AES-256 key). */
  hashLength: 32;
};

export type Pbkdf2Params = {
  iterations: number;
  hash: "SHA-256";
};

export type KdfConfig =
  | { kdf: "argon2id"; params: Argon2idParams }
  | { kdf: "pbkdf2"; params: Pbkdf2Params };

export const DEFAULT_ARGON2ID_PARAMS: Argon2idParams = {
  memoryKiB: 65_536,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
};

export const DEFAULT_KDF_CONFIG: KdfConfig = { kdf: "argon2id", params: DEFAULT_ARGON2ID_PARAMS };

/** Bounds applied to parameters read from the server, so it can't make us hang or OOM. */
export const KDF_LIMITS = {
  argon2id: { memoryKiB: [8_192, 1_048_576], iterations: [1, 10], parallelism: [1, 4] },
  pbkdf2: { iterations: [100_000, 10_000_000] },
} as const;

const inRange = (n: unknown, [min, max]: readonly [number, number]) =>
  typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

/** Thrown when stored KDF settings are unknown or out of bounds. */
export class KdfConfigError extends Error {
  constructor() {
    super("Unsupported key-derivation settings.");
    this.name = "KdfConfigError";
  }
}

/**
 * Validate the KDF settings stored with a vault. `params` may be null for
 * PBKDF2 rows written before KDF parameters were recorded (600k iterations).
 */
export function parseKdfConfig(kdf: unknown, params: unknown): KdfConfig {
  if (kdf === "argon2id") {
    const p = params as Partial<Argon2idParams> | null;
    const L = KDF_LIMITS.argon2id;
    if (
      p &&
      inRange(p.memoryKiB, L.memoryKiB) &&
      inRange(p.iterations, L.iterations) &&
      inRange(p.parallelism, L.parallelism) &&
      p.hashLength === 32 &&
      (p.memoryKiB ?? 0) >= 8 * (p.parallelism ?? 1)
    ) {
      return {
        kdf: "argon2id",
        params: {
          memoryKiB: p.memoryKiB!,
          iterations: p.iterations!,
          parallelism: p.parallelism!,
          hashLength: 32,
        },
      };
    }
    throw new KdfConfigError();
  }
  if (kdf === "pbkdf2") {
    if (params === null || params === undefined) {
      return { kdf: "pbkdf2", params: { iterations: PBKDF2_ITERATIONS, hash: "SHA-256" } };
    }
    const p = params as Partial<Pbkdf2Params>;
    if (inRange(p.iterations, KDF_LIMITS.pbkdf2.iterations) && p.hash === "SHA-256") {
      return { kdf: "pbkdf2", params: { iterations: p.iterations!, hash: "SHA-256" } };
    }
  }
  throw new KdfConfigError();
}

// ─── Argon2id (worker with main-thread fallback) ─────────────────────────────

let worker: Worker | null | undefined; // undefined = not tried yet; null = unavailable
let nextId = 0;

async function getWorker(): Promise<Worker | null> {
  if (worker !== undefined) return worker;
  if (typeof Worker === "undefined") return (worker = null);
  try {
    // Loaded only where workers exist, so Node never sees import.meta.
    const { createKdfWorker } = await import("./kdf-worker-client");
    worker = createKdfWorker();
  } catch {
    worker = null;
  }
  return worker;
}

function argon2idInWorker(
  w: Worker,
  password: string,
  salt: Uint8Array,
  params: Argon2idParams
): Promise<Uint8Array> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    };
    const onMessage = (e: MessageEvent<Argon2Response>) => {
      if (e.data.id !== id) return;
      cleanup();
      if ("error" in e.data) reject(new Error(e.data.error));
      else resolve(e.data.hash);
    };
    const onError = (e: Event) => {
      cleanup();
      reject(
        e instanceof ErrorEvent ? (e.error ?? new Error(e.message)) : new Error("worker error")
      );
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    const request: Argon2Request = { id, password, salt, params };
    w.postMessage(request);
  });
}

async function argon2idOffMainThread(
  password: string,
  salt: Uint8Array,
  params: Argon2idParams
): Promise<Uint8Array> {
  const w = await getWorker();
  if (w) {
    try {
      return await argon2idInWorker(w, password, salt, params);
    } catch {
      // Worker could not start (e.g. blocked) — stop using it and fall back.
      w.terminate();
      worker = null;
    }
  }
  return argon2idRaw(password, salt, params);
}

// ─── KEK ─────────────────────────────────────────────────────────────────────

/**
 * Derive the key-encryption key from the master password. Non-extractable and
 * limited to wrapKey/unwrapKey, so it can never encrypt item data directly.
 */
export async function deriveKek(
  masterPassword: string,
  salt: Uint8Array<ArrayBuffer>,
  config: KdfConfig = DEFAULT_KDF_CONFIG
): Promise<CryptoKey> {
  const usages: KeyUsage[] = ["wrapKey", "unwrapKey"];
  const aes = { name: "AES-GCM", length: 256 } as const;

  if (config.kdf === "argon2id") {
    const raw = await argon2idOffMainThread(masterPassword, salt, config.params);
    try {
      return await globalThis.crypto.subtle.importKey(
        "raw",
        new Uint8Array(raw),
        aes,
        false,
        usages
      );
    } finally {
      raw.fill(0); // best effort: don't leave key bytes in JS memory
    }
  }

  const material = await globalThis.crypto.subtle.importKey(
    "raw",
    stringToBytes(masterPassword),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return globalThis.crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: config.params.iterations },
    material,
    aes,
    false,
    usages
  );
}
