import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { argon2idRaw, type Argon2Request, type Argon2Response } from "../argon2";
import type { KdfConfig } from "../kdf";

// The Argon2id Web Worker path in kdf.ts (the browser's normal path), the
// worker itself (kdf.worker.ts) and the code that creates it
// (kdf-worker-client.ts). Node has no Worker, so these use stand-ins that run
// the real Argon2id; the browser path is also exercised end to end by e2e/.

const FAST: KdfConfig = {
  kdf: "argon2id",
  params: { memoryKiB: 8_192, iterations: 1, parallelism: 1, hashLength: 32 },
};
const PASSWORD = "Worker-Master-Pass-1!";

type Behaviour = "ok" | "reply-error" | "error-event" | "plain-error-event";

/** Stands in for the Argon2id worker: answers postMessage like kdf.worker.ts. */
class FakeKdfWorker extends EventTarget {
  static behaviour: Behaviour = "ok";
  static instances: FakeKdfWorker[] = [];
  terminated = false;
  requests = 0;

  constructor() {
    super();
    FakeKdfWorker.instances.push(this);
  }

  postMessage(request: Argon2Request) {
    this.requests++;
    void (async () => {
      // A reply for some other request must be ignored.
      this.dispatchEvent(new MessageEvent("message", { data: { id: -1, error: "not mine" } }));
      const behaviour = FakeKdfWorker.behaviour;
      if (behaviour === "error-event") {
        this.dispatchEvent(new ErrorEvent("error", { message: "worker blocked by CSP" }));
        return;
      }
      if (behaviour === "plain-error-event") {
        this.dispatchEvent(new Event("error"));
        return;
      }
      const data: Argon2Response =
        behaviour === "reply-error"
          ? { id: request.id, error: "out of memory" }
          : {
              id: request.id,
              hash: await argon2idRaw(request.password, request.salt, request.params),
            };
      this.dispatchEvent(new MessageEvent("message", { data }));
    })();
  }

  terminate() {
    this.terminated = true;
  }
}

const createKdfWorker = vi.fn(() => new FakeKdfWorker() as unknown as Worker);
vi.mock("../kdf-worker-client", () => ({ createKdfWorker: () => createKdfWorker() }));

/** A fresh kdf.ts (it caches its worker in module state). */
async function freshKdf() {
  vi.resetModules();
  return import("../kdf");
}

/** True when `kek` unwraps a vault key wrapped under a main-thread KEK from the same input. */
async function sameKeyAsMainThread(kek: CryptoKey, salt: Uint8Array<ArrayBuffer>) {
  const { deriveKek } = await freshKdf();
  vi.stubGlobal("Worker", undefined); // main thread only
  const reference = await deriveKek(PASSWORD, salt, FAST);
  const { generateVaultKey, wrapVaultKey, unwrapVaultKey } = await import("../key-wrapping");
  const vaultKey = await generateVaultKey();
  const wrapped = await wrapVaultKey(vaultKey, reference);
  await expect(unwrapVaultKey(wrapped, kek)).resolves.toBeDefined();
}

beforeEach(() => {
  FakeKdfWorker.behaviour = "ok";
  FakeKdfWorker.instances = [];
  createKdfWorker.mockClear();
  vi.stubGlobal("Worker", FakeKdfWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Argon2id in the KDF worker (kdf.ts)", () => {
  it("derives the same key in the worker as on the main thread, and reuses the worker", async () => {
    const { deriveKek } = await freshKdf();
    const { generateSalt } = await import("../key-derivation");
    const salt = generateSalt();
    const kek = await deriveKek(PASSWORD, salt, FAST);
    await deriveKek(PASSWORD, salt, FAST);

    expect(createKdfWorker).toHaveBeenCalledTimes(1);
    expect(FakeKdfWorker.instances[0]?.requests).toBe(2);
    await sameKeyAsMainThread(kek, salt);
  });

  it.each<Behaviour>(["reply-error", "error-event", "plain-error-event"])(
    "falls back to the main thread when the worker fails (%s) and stops using it",
    async (behaviour) => {
      FakeKdfWorker.behaviour = behaviour;
      const { deriveKek } = await freshKdf();
      const { generateSalt } = await import("../key-derivation");
      const salt = generateSalt();

      const kek = await deriveKek(PASSWORD, salt, FAST);
      const worker = FakeKdfWorker.instances[0];
      expect(worker?.terminated).toBe(true);

      // The next derivation doesn't try the worker again.
      await deriveKek(PASSWORD, salt, FAST);
      expect(worker?.requests).toBe(1);
      expect(createKdfWorker).toHaveBeenCalledTimes(1);
      await sameKeyAsMainThread(kek, salt);
    }
  );

  it("falls back to the main thread when the worker can't be created", async () => {
    createKdfWorker.mockImplementationOnce(() => {
      throw new Error("SecurityError: worker-src blocked");
    });
    const { deriveArgon2idEncryptionKey } = await freshKdf();
    const { generateSalt } = await import("../key-derivation");
    const key = await deriveArgon2idEncryptionKey(PASSWORD, generateSalt(), FAST.params);
    expect(key.usages.sort()).toEqual(["decrypt", "encrypt"]);
    expect(FakeKdfWorker.instances).toHaveLength(0);
  });
});

describe("kdf.worker.ts", () => {
  /** Loads the worker module against a stand-in worker global scope. */
  async function loadWorker() {
    const posted: unknown[] = [];
    const scope = Object.assign(new EventTarget(), {
      postMessage: (message: unknown) => posted.push(message),
    });
    vi.stubGlobal("self", scope);
    vi.resetModules();
    await import("../kdf.worker");
    const ask = async (data: Argon2Request) => {
      scope.dispatchEvent(new MessageEvent("message", { data }));
      await vi.waitFor(() => expect(posted.length).toBeGreaterThan(0));
      return posted.shift() as Argon2Response;
    };
    return { ask };
  }

  it("answers with the Argon2id hash for the request's id", async () => {
    const { ask } = await loadWorker();
    const salt = new Uint8Array(16).fill(7);
    const response = await ask({ id: 42, password: PASSWORD, salt, params: FAST.params });
    expect(response).toEqual({
      id: 42,
      hash: await argon2idRaw(PASSWORD, new Uint8Array(16).fill(7), FAST.params),
    });
  });

  it("answers with an error, not a hash, when Argon2id fails", async () => {
    const { ask } = await loadWorker();
    const response = await ask({
      id: 7,
      password: PASSWORD,
      salt: new Uint8Array(2), // too short for Argon2
      params: FAST.params,
    });
    expect(response).toMatchObject({ id: 7, error: expect.any(String) });
    expect("hash" in response).toBe(false);
  });
});

describe("kdf-worker-client.ts", () => {
  it("creates a module worker from kdf.worker.ts (the bundler's worker pattern)", async () => {
    const created: Array<{ url: URL; options: WorkerOptions | undefined }> = [];
    vi.stubGlobal(
      "Worker",
      class {
        constructor(url: URL, options?: WorkerOptions) {
          created.push({ url, options });
        }
      }
    );
    const actual =
      await vi.importActual<typeof import("../kdf-worker-client")>("../kdf-worker-client");
    actual.createKdfWorker();
    expect(created).toHaveLength(1);
    expect(created[0]?.url.pathname).toMatch(/\/kdf\.worker\.ts$/);
    expect(created[0]?.options).toEqual({ type: "module" });
  });
});
