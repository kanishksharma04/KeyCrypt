import {
  decryptItem,
  deriveKek,
  encryptItem,
  fromBase64,
  generateItemId,
  itemAad,
  parseKdfConfig,
  unwrapVaultKey,
  VaultKeyUnwrapError,
  verifyVaultKey,
} from "keycrypt/crypto";

// Talks to the KeyCrypt server (session cookie, JSON) and does all vault
// crypto locally with the web app's own crypto module (src/lib/crypto,
// imported through the workspace package "keycrypt"). Runs in the background
// service worker, which holds the vault key as a non-extractable CryptoKey in
// memory only (src/session.ts).

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
  /** Authenticator key as an otpauth://totp/ link, if the login has one. */
  totp: string;
}

/** An authenticator (OTP_SECRET) item: enough to compute its codes. */
export interface AuthenticatorEntry {
  id: string;
  name: string;
  secret: string;
  issuer: string;
  account: string;
  algorithm: "SHA1" | "SHA256" | "SHA512";
  digits: number;
  period: number;
}

export interface DecryptedVault {
  logins: LoginEntry[];
  authenticators: AuthenticatorEntry[];
}

export class NotSignedInError extends Error {}
/** Signed in, but the vault hasn't been set up in the web app yet. */
export class NoVaultError extends Error {}

async function getJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  // host_permissions for the app origin let the extension send the session cookie.
  const response = await fetch(new URL(path, APP_URL), {
    credentials: "include",
    cache: "no-store",
    ...init,
  });
  if (response.status === 401) throw new NotSignedInError();
  if (!response.ok) {
    let message = `KeyCrypt answered ${response.status}`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string") message = body.error;
    } catch {
      // not JSON
    }
    if (response.status === 404 && path.startsWith("/api/ext/vault-meta")) {
      throw new NoVaultError(message);
    }
    throw new Error(message);
  }
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

/** Decrypt one row's v2 envelope { name, secret } (older rows keep the name in plain text). */
async function openRow(
  key: CryptoKey,
  userId: string,
  row: ItemRow,
  type: "LOGIN" | "OTP_SECRET"
): Promise<{ name: string; secret: Record<string, unknown> } | null> {
  try {
    const raw = await decryptItem<unknown>(
      key,
      { ciphertext: row.ciphertext, iv: row.iv },
      itemAad({ userId, itemId: row.id, type })
    );
    const envelope = (row.name === null ? raw : { name: row.name, secret: raw }) as {
      name?: unknown;
      secret?: unknown;
    };
    const secret = envelope.secret;
    if (typeof envelope.name !== "string" || !secret || typeof secret !== "object") return null;
    return { name: envelope.name, secret: secret as Record<string, unknown> };
  } catch {
    return null; // unreadable rows are skipped
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Logins and authenticators, decrypted locally (AAD = user, item id, type). */
export async function loadVault(key: CryptoKey, userId: string): Promise<DecryptedVault> {
  const [loginRows, otpRows] = await Promise.all([
    getJson<{ items: ItemRow[] }>("/api/ext/items?type=LOGIN"),
    getJson<{ items: ItemRow[] }>("/api/ext/items?type=OTP_SECRET"),
  ]);

  const logins = await Promise.all(
    loginRows.items.map(async (row): Promise<LoginEntry | null> => {
      const opened = await openRow(key, userId, row, "LOGIN");
      if (!opened || typeof opened.secret.password !== "string") return null;
      const s = opened.secret;
      return {
        id: row.id,
        name: opened.name,
        username: str(s.username),
        password: str(s.password),
        url: str(s.url),
        totp: str(s.totp),
      };
    })
  );

  const authenticators = await Promise.all(
    otpRows.items.map(async (row): Promise<AuthenticatorEntry | null> => {
      const opened = await openRow(key, userId, row, "OTP_SECRET");
      const s = opened?.secret;
      if (!opened || !s || !str(s.secret)) return null;
      const algorithm = s.algorithm === "SHA256" || s.algorithm === "SHA512" ? s.algorithm : "SHA1";
      return {
        id: row.id,
        name: opened.name,
        secret: str(s.secret),
        issuer: str(s.issuer),
        account: str(s.account),
        algorithm,
        digits: typeof s.digits === "number" ? s.digits : 6,
        period: typeof s.period === "number" ? s.period : 30,
      };
    })
  );

  return {
    logins: logins.filter((e): e is LoginEntry => e !== null),
    authenticators: authenticators.filter((e): e is AuthenticatorEntry => e !== null),
  };
}

/**
 * Save a new login: encrypted here, with a fresh item id bound into the AAD,
 * then sent as ciphertext to POST /api/ext/items.
 */
export async function saveLogin(
  key: CryptoKey,
  userId: string,
  login: { name: string; username: string; password: string; url: string }
): Promise<string> {
  const id = generateItemId();
  const { ciphertext, iv } = await encryptItem(
    key,
    {
      name: login.name,
      secret: { username: login.username, password: login.password, url: login.url, notes: "" },
    },
    itemAad({ userId, itemId: id, type: "LOGIN" })
  );
  await getJson<{ id: string }>("/api/ext/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, type: "LOGIN", ciphertext, iv }),
  });
  return id;
}
