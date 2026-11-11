import { describe, expect, it } from "vitest";
import type { VaultItemRow } from "@/types/vault";
import {
  clearOfflineVault,
  loadOfflineVault,
  parseSnapshot,
  saveOfflineVault,
  toSnapshot,
  type OfflineVaultMeta,
  type OfflineVaultSnapshot,
  type SnapshotStore,
} from "../offline-cache";

function memoryStore(): SnapshotStore & { value: unknown } {
  const store = {
    value: undefined as unknown,
    get: async () => store.value,
    set: async (v: OfflineVaultSnapshot) => {
      // What IndexedDB would keep: a structured clone.
      store.value = structuredClone(v);
    },
    clear: async () => {
      store.value = undefined;
    },
  };
  return store;
}

const META: OfflineVaultMeta = {
  cryptoVersion: 2,
  kdf: "argon2id",
  kdfParams: { memoryKiB: 65_536, iterations: 3, parallelism: 1, hashLength: 32 },
  salt: "c2FsdHNhbHRzYWx0c2FsdA==",
  verificationBlob: "dmVyaWZpZXI=",
  verificationIv: "aXYtaXYtaXYtaXYt",
  wrappedVaultKey: "d3JhcHBlZA==",
  wrapIv: "d3JhcC1pdi1pdi1p",
};

const ITEM: VaultItemRow = {
  id: "6f1c2a4e-8b3d-4f5a-9c7e-1d2b3a4c5e6f",
  type: "LOGIN",
  name: null,
  ciphertext: "Y2lwaGVydGV4dA==",
  iv: "aXYtaXYtaXYtaXYt",
  favorite: true,
  folderId: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-02T00:00:00.000Z",
};

const USER = "cuser000000000000000000001";

describe("offline vault cache", () => {
  it("round-trips the encrypted vault", async () => {
    const store = memoryStore();
    await saveOfflineVault({ userId: USER, meta: META, items: [ITEM] }, store);
    const snapshot = await loadOfflineVault(store);
    expect(snapshot).toMatchObject({ version: 1, userId: USER, meta: META, items: [ITEM] });
    expect(Date.parse(snapshot?.savedAt ?? "")).not.toBeNaN();
  });

  it("stores ciphertext and unlock material only: no recovery copy, keys or plaintext", async () => {
    const store = memoryStore();
    const leaky = {
      ...META,
      recoveryWrappedKey: "cmVjb3Zlcnk=",
      recoveryIv: "cmVjLWl2LWl2LWl2",
      recoveryCreatedAt: "2026-11-01T00:00:00.000Z",
    };
    const decryptedRow = {
      ...ITEM,
      secret: { password: "hunter2" },
      vaultKey: "raw-key-bytes",
      masterPassword: "Master-Pass-1!",
    } as unknown as VaultItemRow;
    await saveOfflineVault({ userId: USER, meta: leaky, items: [decryptedRow] }, store);

    const stored = JSON.stringify(store.value);
    for (const secret of [
      "cmVjb3Zlcnk=",
      "hunter2",
      "raw-key-bytes",
      "Master-Pass-1!",
      "recovery",
    ]) {
      expect(stored).not.toContain(secret);
    }
    expect(Object.keys((store.value as OfflineVaultSnapshot).items[0] ?? {}).sort()).toEqual(
      [
        "ciphertext",
        "createdAt",
        "favorite",
        "folderId",
        "id",
        "iv",
        "name",
        "type",
        "updatedAt",
      ].sort()
    );
  });

  it("clears the copy", async () => {
    const store = memoryStore();
    await saveOfflineVault({ userId: USER, meta: META, items: [ITEM] }, store);
    await clearOfflineVault(store);
    expect(await loadOfflineVault(store)).toBeNull();
  });

  it("ignores a missing, damaged or other-version snapshot", async () => {
    const good = toSnapshot({ userId: USER, meta: META, items: [ITEM] });
    for (const value of [
      undefined,
      null,
      "text",
      { ...good, version: 2 },
      { ...good, userId: 7 },
      { ...good, meta: { ...good.meta, salt: 1 } },
      { ...good, items: "nope" },
      { ...good, items: [{ ...ITEM, type: "PASSPORT" }] },
      { ...good, items: [{ ...ITEM, ciphertext: undefined }] },
    ]) {
      expect(parseSnapshot(value)).toBeNull();
    }
    expect(parseSnapshot(good)).toEqual(good);
  });

  it("never throws when storage fails", async () => {
    const broken: SnapshotStore = {
      get: async () => {
        throw new Error("quota");
      },
      set: async () => {
        throw new Error("quota");
      },
      clear: async () => {
        throw new Error("blocked");
      },
    };
    await expect(loadOfflineVault(broken)).resolves.toBeNull();
    await expect(clearOfflineVault(broken)).resolves.toBeUndefined();
  });
});
