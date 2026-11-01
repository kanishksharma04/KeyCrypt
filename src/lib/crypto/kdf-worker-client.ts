// Creates the Argon2id Web Worker. Loaded lazily by kdf.ts, and only where a
// Worker exists (the browser), so Node/test code never evaluates import.meta.
// Bundlers recognise `new Worker(new URL(..., import.meta.url))` and emit
// kdf.worker.ts as its own same-origin chunk.

export function createKdfWorker(): Worker {
  return new Worker(new URL("./kdf.worker.ts", import.meta.url), { type: "module" });
}
