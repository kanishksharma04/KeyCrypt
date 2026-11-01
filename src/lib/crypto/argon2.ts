import { argon2id } from "hash-wasm";

// Raw Argon2id (hash-wasm) and the worker message types. Kept separate from
// kdf.ts so the worker (kdf.worker.ts) can import it without pulling in the
// code that creates the worker, which would make the bundle reference itself.

/** Argon2id cost parameters (same shape as Argon2idParams in kdf.ts). */
export type Argon2Settings = {
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  hashLength: number;
};

export interface Argon2Request {
  id: number;
  password: string;
  salt: Uint8Array;
  params: Argon2Settings;
}
export type Argon2Response = { id: number; hash: Uint8Array } | { id: number; error: string };

/** Raw Argon2id on the current thread (used by the worker and as the fallback). */
export async function argon2idRaw(
  password: string,
  salt: Uint8Array,
  params: Argon2Settings
): Promise<Uint8Array> {
  return argon2id({
    password,
    salt,
    iterations: params.iterations,
    parallelism: params.parallelism,
    memorySize: params.memoryKiB,
    hashLength: params.hashLength,
    outputType: "binary",
  });
}
