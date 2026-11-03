import {
  decryptItem,
  deriveKek,
  fromBase64,
  itemAad,
  parseKdfConfig,
  unwrapVaultKey,
  VaultKeyUnwrapError,
  verifyVaultKey,
} from "keycrypt/crypto";

// Talks to the KeyCrypt server (session cookie, JSON) and does all vault
// crypto locally with the web app's own crypto module (src/lib/crypto,
// imported through the workspace package "keycrypt"). The vault key exists
// only as a non-extractable CryptoKey in the popup's memory.

export const APP_URL: string = __KEYCRYPT_APP_URL__;

export interface VaultMeta {
  userId: string;
  cryptoVersion: number;
  kdf: string;
  kdfParams: unknown;
  salt: string;
  verificationBlob: string;
  verificationIv: string;
  wrappedVaultKey: string | null;
  wrapIv: string | null;
}

interface ItemRow {
  id: string;
  type: string;
  name: string | null;
  ciphertext: string;
  iv: string;
}

export interface LoginEntry {
  id: string;
  name: string;
  username: string;
  password: string;
  url: string;
}

export class NotSignedInError extends Error {}

async function getJson<T>(path: string): Promise<T> {
  // host_permissions for the app origin let the popup send the session cookie.
  const response = await fetch(new URL(path, APP_URL), {
    credentials: "include",
    cache: "no-store",
  });
  if (response.status === 401) throw new NotSignedInError();
  if (!response.ok) throw new Error(`KeyCrypt answered ${response.status}`);
  return (await response.json()) as T;
}

export function fetchVaultMeta(): Promise<VaultMeta> {
  return getJson<VaultMeta>("/api/ext/vault-meta");
}

export type UnlockResult =
  | { status: "unlocked"; key: CryptoKey }
  | { status: "wrong-password" }
  | { status: "needs-upgrade" };

/** Derive the KEK (Argon2id, in a worker) and unwrap the vault key, locally. */
export async function unlock(masterPassword: string, meta: VaultMeta): Promise<UnlockResult> {
  if (meta.cryptoVersion !== 2 || !meta.wrappedVaultKey || !meta.wrapIv) {
    return { status: "needs-upgrade" };
  }
  // parseKdfConfig bounds-checks the stored parameters before deriving.
  const kek = await deriveKek(
    masterPassword,
    fromBase64(meta.salt),
    parseKdfConfig(meta.kdf, meta.kdfParams)
  );
  let key: CryptoKey;
  try {
    key = await unwrapVaultKey({ wrappedKey: meta.wrappedVaultKey, iv: meta.wrapIv }, kek);
  } catch (err) {
    if (err instanceof VaultKeyUnwrapError) return { status: "wrong-password" };
    throw err;
  }
  const verifier = { ciphertext: meta.verificationBlob, iv: meta.verificationIv };
  if (!(await verifyVaultKey(key, verifier))) return { status: "wrong-password" };
  return { status: "unlocked", key };
}

/** Every LOGIN item, decrypted locally (AAD = user, item id, type). Unreadable ones are skipped. */
export async function loadLogins(key: CryptoKey, userId: string): Promise<LoginEntry[]> {
  const { items } = await getJson<{ items: ItemRow[] }>("/api/ext/items?type=LOGIN");
  const opened = await Promise.all(
    items.map(async (row): Promise<LoginEntry | null> => {
      try {
        const raw = await decryptItem<unknown>(
          key,
          { ciphertext: row.ciphertext, iv: row.iv },
          itemAad({ userId, itemId: row.id, type: "LOGIN" })
        );
        // v2 payload { name, secret }; older rows keep the name in plain text.
        const envelope = (row.name === null ? raw : { name: row.name, secret: raw }) as {
          name?: unknown;
          secret?: { username?: unknown; password?: unknown; url?: unknown } | null;
        };
        const s = envelope.secret;
        if (typeof envelope.name !== "string" || !s || typeof s.password !== "string") return null;
        return {
          id: row.id,
          name: envelope.name,
          username: typeof s.username === "string" ? s.username : "",
          password: s.password,
          url: typeof s.url === "string" ? s.url : "",
        };
      } catch {
        return null;
      }
    })
  );
  return opened.filter((e): e is LoginEntry => e !== null);
}
