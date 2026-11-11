import type { VaultItemRow, VaultItemType } from "@/types/vault";

// The read-only offline vault: after each online load of the vault, the
// browser keeps the latest ENCRYPTED vault in IndexedDB so /offline can unlock
// and show it without the server. Only ciphertext and unlock material go in:
// the salt, KDF settings, wrapped vault key and verifier (as the server stores
// them), and each item's ciphertext row. Never the master password, the vault
// key, the recovery copy of the key, or anything decrypted. Every field is
// copied through a whitelist, so a stray property can't end up on disk.
//
// Cleared on sign-out, on account deletion, on "Sign out of all devices", and
// on the next online visit to the sign-in page (which is where a device whose
// session was revoked ends up).

export const OFFLINE_SNAPSHOT_VERSION = 1;
const ITEM_TYPES: readonly VaultItemType[] = [
  "LOGIN",
  "SECURE_NOTE",
  "API_KEY",
  "WIFI_PASSWORD",
  "OTP_SECRET",
];

/** What unlocking needs (VaultMetaForUnlock without the recovery copy). */
export interface OfflineVaultMeta {
  cryptoVersion: number;
  kdf: string;
  kdfParams: unknown;
  salt: string;
  verificationBlob: string;
  verificationIv: string;
  wrappedVaultKey: string | null;
  wrapIv: string | null;
}

export interface OfflineVaultSnapshot {
  version: typeof OFFLINE_SNAPSHOT_VERSION;
  userId: string;
  /** ISO time of the online load it was taken from. */
  savedAt: string;
  meta: OfflineVaultMeta;
  items: VaultItemRow[];
}

/** Where snapshots live: IndexedDB in the browser, a Map in tests. */
export interface SnapshotStore {
  get(): Promise<unknown>;
  set(value: OfflineVaultSnapshot): Promise<void>;
  clear(): Promise<void>;
}

// ─── Whitelisting and validation (pure) ──────────────────────────────────────

const isString = (v: unknown): v is string => typeof v === "string";
const isNullableString = (v: unknown): v is string | null => v === null || typeof v === "string";

/** Copies only the unlock fields (no recovery copy, nothing else). */
export function pickMeta(meta: OfflineVaultMeta): OfflineVaultMeta {
  return {
    cryptoVersion: meta.cryptoVersion,
    kdf: meta.kdf,
    kdfParams: meta.kdfParams === undefined ? null : JSON.parse(JSON.stringify(meta.kdfParams)),
    salt: meta.salt,
    verificationBlob: meta.verificationBlob,
    verificationIv: meta.verificationIv,
    wrappedVaultKey: meta.wrappedVaultKey,
    wrapIv: meta.wrapIv,
  };
}

/** Copies only the ciphertext row fields of an item. */
export function pickItem(item: VaultItemRow): VaultItemRow {
  return {
    id: item.id,
    type: item.type,
    name: item.name, // null for v2 items (the name is inside the ciphertext)
    ciphertext: item.ciphertext,
    iv: item.iv,
    favorite: item.favorite,
    folderId: item.folderId ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function toSnapshot(
  input: { userId: string; meta: OfflineVaultMeta; items: VaultItemRow[] },
  now: Date = new Date()
): OfflineVaultSnapshot {
  return {
    version: OFFLINE_SNAPSHOT_VERSION,
    userId: input.userId,
    savedAt: now.toISOString(),
    meta: pickMeta(input.meta),
    items: input.items.map(pickItem),
  };
}

function parseMeta(value: unknown): OfflineVaultMeta | null {
  if (!value || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;
  if (
    typeof m.cryptoVersion !== "number" ||
    !isString(m.kdf) ||
    !isString(m.salt) ||
    !isString(m.verificationBlob) ||
    !isString(m.verificationIv) ||
    !isNullableString(m.wrappedVaultKey) ||
    !isNullableString(m.wrapIv)
  ) {
    return null;
  }
  return pickMeta(m as unknown as OfflineVaultMeta);
}

function parseItem(value: unknown): VaultItemRow | null {
  if (!value || typeof value !== "object") return null;
  const i = value as Record<string, unknown>;
  if (
    !isString(i.id) ||
    !ITEM_TYPES.includes(i.type as VaultItemType) ||
    !isNullableString(i.name) ||
    !isString(i.ciphertext) ||
    !isString(i.iv) ||
    typeof i.favorite !== "boolean" ||
    !isNullableString(i.folderId ?? null) ||
    !isString(i.createdAt) ||
    !isString(i.updatedAt)
  ) {
    return null;
  }
  return pickItem(i as unknown as VaultItemRow);
}

/** A stored snapshot, validated; null when missing, damaged or from another version. */
export function parseSnapshot(value: unknown): OfflineVaultSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>;
  if (s.version !== OFFLINE_SNAPSHOT_VERSION || !isString(s.userId) || !isString(s.savedAt)) {
    return null;
  }
  const meta = parseMeta(s.meta);
  if (!meta || !Array.isArray(s.items)) return null;
  const items: VaultItemRow[] = [];
  for (const raw of s.items) {
    const item = parseItem(raw);
    if (!item) return null; // a damaged snapshot is ignored as a whole
    items.push(item);
  }
  return { version: OFFLINE_SNAPSHOT_VERSION, userId: s.userId, savedAt: s.savedAt, meta, items };
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const DB_NAME = "keycrypt-offline";
const STORE = "vault";
const KEY = "snapshot";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDB in the browser; a store that holds nothing where it isn't available. */
export function indexedDbStore(): SnapshotStore {
  if (typeof indexedDB === "undefined") {
    return { get: async () => null, set: async () => {}, clear: async () => {} };
  }
  async function open(): Promise<IDBDatabase> {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    return request(req);
  }
  async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const db = await open();
    try {
      return await request(run(db.transaction(STORE, mode).objectStore(STORE)));
    } finally {
      db.close();
    }
  }
  return {
    get: () => withStore("readonly", (s) => s.get(KEY)),
    set: async (value) => {
      await withStore("readwrite", (s) => s.put(value, KEY));
    },
    clear: async () => {
      await withStore("readwrite", (s) => s.delete(KEY));
    },
  };
}

export async function saveOfflineVault(
  input: { userId: string; meta: OfflineVaultMeta; items: VaultItemRow[] },
  store: SnapshotStore = indexedDbStore()
): Promise<void> {
  await store.set(toSnapshot(input));
}

export async function loadOfflineVault(
  store: SnapshotStore = indexedDbStore()
): Promise<OfflineVaultSnapshot | null> {
  try {
    return parseSnapshot(await store.get());
  } catch {
    return null;
  }
}

/** Removes the offline copy. Never throws: callers are usually signing out. */
export async function clearOfflineVault(store: SnapshotStore = indexedDbStore()): Promise<void> {
  try {
    await store.clear();
  } catch {
    // nothing stored, or storage unavailable
  }
}
