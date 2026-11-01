/// <reference lib="webworker" />
import { argon2idRaw, type Argon2Request, type Argon2Response } from "./argon2";

// Runs Argon2id off the main thread so the page stays responsive while the
// key-encryption key is derived (see kdf.ts). Imports only argon2.ts. Receives the master password
// and salt from the page; returns only the derived bytes. Nothing leaves the
// browser.

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener("message", async (event: MessageEvent<Argon2Request>) => {
  const { id, password, salt, params } = event.data;
  let response: Argon2Response;
  try {
    const hash = await argon2idRaw(password, salt, params);
    response = { id, hash };
    scope.postMessage(response, [hash.buffer]);
  } catch (e) {
    response = { id, error: e instanceof Error ? e.message : "argon2id failed" };
    scope.postMessage(response);
  }
});
