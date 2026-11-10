# KeyCrypt threat model

This document describes what KeyCrypt protects, who it protects it from, and where the protection
stops. It describes the code as it is; the numbers here are checked against the source by
`src/lib/__tests__/threat-model-doc.test.ts`. To report a problem, see
[`SECURITY.md`](../SECURITY.md).

## Summary

KeyCrypt is a web password manager with a zero-knowledge design: every vault item is encrypted
**in the browser** with a key derived from a master password that never leaves the browser. The
server stores ciphertext and some metadata. A server breach, a database leak or a curious operator
should not reveal anyone's passwords, notes, item names or folder names.

The main limit is the one every web-based password manager shares: **the browser runs the
JavaScript the server sends**. A server that turns malicious can send code that steals the master
password the next time the user unlocks. See [Attacks not covered](#attacks-not-covered).

## Assets

| Asset                                   | Where it lives                                                         |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Vault contents (secrets and item names) | Ciphertext on the server; plaintext only in the unlocked browser tab   |
| Folder names                            | Ciphertext on the server; plaintext only in the unlocked browser tab   |
| Master password                         | Typed into the browser; never stored or sent anywhere                  |
| Vault key                               | Random; wrapped (encrypted) on the server; unwrapped only in memory    |
| Recovery key                            | Shown to the user once; never stored by KeyCrypt                       |
| Account password                        | Sent to the server at sign-in; stored only as an Argon2id hash         |
| Account (session, email, 2FA)           | Server: session JWTs, email, encrypted TOTP secret, backup-code hashes |
| Exports                                 | Files on the user's device (encrypted JSON, or plain CSV)              |

## Attackers

1. **Database or backup thief**: gets a copy of the PostgreSQL database.
2. **Curious or compromised operator, passive**: can read everything the server stores and every
   request it receives, but serves the genuine application code.
3. **Network attacker**: can watch or tamper with traffic between the browser and the server.
4. **Online attacker**: knows or guesses a user's email and tries to sign in, or holds a stolen
   session cookie.
5. **Other users** of the same KeyCrypt instance.
6. **Malicious server, active**: changes the JavaScript it serves. Not defended against; see below.
7. **Attacker on the user's device**: malware, a malicious browser extension, or someone with the
   unlocked device. Not defended against; see below.

## Trust boundaries

```
 ┌───────────────── user's device ─────────────────┐
 │  browser tab (trusted while the code is honest) │
 │   master password → Argon2id → KEK → vault key  │
 │   encrypt / decrypt items and folder names      │
 └──────────────────────┬──────────────────────────┘
                        │ HTTPS (HSTS): ciphertext, metadata,
                        │ account password at sign-in only
 ┌──────────────────────▼──────────────────────────┐
 │  KeyCrypt server (Next.js) + PostgreSQL         │  ← stores ciphertext; never has the
 │  (optional: Upstash Redis for rate limits)      │    master password or vault key
 └─────────────────────────────────────────────────┘
          opt-in only, from the browser directly:
          api.pwnedpasswords.com (5-character SHA-1 prefixes)
```

- The **browser** is where plaintext exists. It must be trusted, and so must the code the server
  delivers to it.
- The **server** is trusted for availability, account authentication and access control (who may
  read which ciphertext), but **not** with vault confidentiality.
- **Have I Been Pwned** is contacted only when the user presses "Check for breached passwords".

## Cryptography (crypto v2)

All vault cryptography lives in `src/lib/crypto` and uses the Web Crypto API, plus `hash-wasm`
for Argon2id in a Web Worker.

### Key hierarchy

```
master password ──Argon2id(salt)──► KEK ──AES-GCM wrap──► wrapped vault key (stored)
recovery key ──HKDF-SHA-256(user id)──► recovery KEK ──AES-GCM wrap──► second wrapped copy (stored)
vault key (random AES-256-GCM) ──► items, folder names, verification blob
```

- **Key derivation**: Argon2id with **64 MiB memory, 3 iterations, parallelism 1**, a 32-byte
  output and a random **16-byte salt** per vault (`src/lib/crypto/kdf.ts`). The parameters are
  stored in `VaultMeta.kdf`/`kdfParams`. The server accepts only Argon2id for new writes, and the
  browser bounds-checks stored parameters before deriving (so a malicious server can't hand it
  weak or huge ones).
- **Vault key**: a random 256-bit AES-GCM key, created in the browser at setup. It is stored on the
  server only **wrapped** (AES-GCM, fresh 12-byte IV) under the KEK (`key-wrapping.ts`). In memory
  it is a **non-extractable** `CryptoKey` (`vault-key.ts`), never persisted, and dropped when the
  vault locks. Changing the master password re-wraps the same key; items are not touched.
- **Unlock check**: a known plaintext encrypted under the vault key (the verification blob) is
  decrypted in the browser. Nothing about the master password is compared on the server.
- **Recovery key**: 128 random bits shown once as grouped base32. A second KEK is derived with
  HKDF-SHA-256 (salt `keycrypt:recovery:v1`, info bound to the user id) and wraps the same vault
  key (`recovery.ts`). HKDF is fast, which is safe because the recovery key is high-entropy.
  Using it lets the user set a new master password.
- **Legacy (crypto v1)**: older vaults used `vaultKey = PBKDF2-SHA-256(master password, salt,
600,000 iterations)`. They are upgraded to v2 on unlock (after an account-password
  confirmation); an unlocked vault is always v2.

### Items and folders

- Every item is encrypted with **AES-256-GCM and a fresh random 96-bit IV**. The plaintext is
  `{ name, secret }`, so **item names are encrypted** together with usernames, passwords, URLs,
  notes, keys and authenticator (TOTP) secrets.
- **Associated data (AAD)** binds each ciphertext to its row: `kc:v2|<userId>|<itemId>|<type>`.
  Item ids are random UUIDs generated in the browser before encryption, and the server refuses
  duplicates. A server that swaps ciphertexts between items, item types or users makes decryption
  fail instead of showing the wrong secret. The AAD has no version, so it does **not** stop the
  server returning an older ciphertext of the same item (see
  [Attacks not covered](#attacks-not-covered)).
- **Folder names** are encrypted the same way, with AAD `kc:v2-folder|<userId>|<folderId>`.
  The different prefix stops a folder name being passed off as an item.

### Account security (separate from the vault)

- **Account password**: hashed on the server with Argon2id (`@node-rs/argon2`, 19 MiB, 2
  iterations). It is a different secret from the master password; the app refuses a master
  password equal to the account password (checked in the browser).
- **Sessions**: Auth.js JWTs (7-day maximum), revocable by bumping `User.tokenVersion` ("sign out
  of all devices", password reset). Revocation takes effect within 60 seconds.
- **Re-authentication**: destructive actions (master-password change, sign out everywhere, plain
  CSV export, recovery-key changes, two-factor changes, account deletion) need the account password
  confirmed within the last 5 minutes (an HMAC-signed cookie).
- **Two-factor sign-in (optional)**: TOTP. The secret is encrypted on the server with AES-256-GCM
  under `TOTP_ENCRYPTION_KEY` (the server can decrypt it; it has to, to check codes). There are
  10 one-time backup codes, stored as Argon2 hashes.
- **Rate limits**: per IP and per email on sign-in, and per user on re-authentication and 2FA
  codes (`src/lib/rate-limit.ts`).

### Exports

- **Encrypted export** (`keycrypt-export` v2): the key is derived from a separate export password
  with Argon2id and the vault's parameters (64 MiB, 3 iterations, parallelism 1, fresh 16-byte
  salt), in the KDF Web Worker, then the payload is encrypted with AES-256-GCM. The KDF and its
  parameters are recorded in the file header and bounds-checked with the vault KDF limits before
  deriving, so a crafted file can't make the browser hang or run out of memory. It is built in the
  browser. Files in the older v1 format (PBKDF2-SHA-256, 600,000 iterations) can still be
  imported, but are no longer written.
- **CSV export**: plain text, after an account-password confirmation. The user is warned.

### Browser extension

The extension (`extension/`, Manifest V3) uses the same crypto module. It fetches the vault metadata
and item ciphertext from `/api/ext/*` with the session cookie, unlocks with the master password
in the popup, and keeps the vault key only in the popup's memory (no `storage` permission). It
fills only the active tab after a click (`activeTab`), on `https://` pages whose host matches the
saved login, and the injected script refuses to fill if the page's host changed.

## What the server sees

**Never**: the master password, the vault key, the recovery key, decrypted secrets, item names or
folder names.

**Stored or seen in plain text**:

- the account email and name, and the account password while signing in, signing up, resetting it
  or confirming it (only its Argon2id hash is stored);
- for each item: its **type**, **favourite** flag, **folder** (which items share a folder, not the
  folder's name), and **created/updated times**; the ciphertext reveals roughly how large each item
  is, and the row count reveals how many items there are;
- vault metadata: salt, KDF parameters, the wrapped vault key (two copies with a recovery key) and
  the verification blob;
- the TOTP secret (encrypted with a server key the server holds) and backup-code hashes;
- an **audit log** of account events with timestamp, **IP address and browser (user agent)**,
  item type on create and export format, kept for **180 days** (older entries are deleted by a
  daily job, `GET /api/cron/prune-audit`, and, where no scheduler runs, by the server itself at most
  once a day);
- session cookies, client IPs and emails (for rate limiting), and normal request logs;
- **server error logs**: one JSON line per failed request on the server's stdout (route pattern,
  method, error name, digest, time and the error message, cut to 300 characters with emails, URLs
  with credentials, query strings, tokens and ciphertext-like strings redacted). Request bodies,
  headers, cookies, form data and server-action arguments are never logged, and nothing is sent to
  a third party. Errors in the browser are never reported, since they could contain decrypted
  data (`src/lib/error-report.ts`).

**Have I Been Pwned** (only if the user runs the breach check) sees the first 5 hex characters of
each password's SHA-1 and the user's IP address. The full hash and the password stay in the
browser.

## Attacks covered

| Attack                                          | Mitigation                                                                                                                                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database or backup leak                         | Only ciphertext, wrapped keys and hashes. Offline guessing of a master password costs one Argon2id (64 MiB) per guess.                                                                                           |
| Passive malicious operator                      | Same as above. The server never receives the master password, vault key or plaintext.                                                                                                                            |
| Swapping or replaying ciphertext between rows   | Between rows only: AES-GCM with AAD bound to user, item or folder id, and type, so a ciphertext moved to another row fails to decrypt. Replaying an older ciphertext of the same row is not covered (see below). |
| Server supplying weak or extreme KDF parameters | The browser bounds-checks KDF parameters before deriving; new writes must be Argon2id.                                                                                                                           |
| Network eavesdropping or tampering              | HTTPS with HSTS in production. Even without TLS, vault data is ciphertext (but see "malicious JavaScript").                                                                                                      |
| Credential stuffing and brute force on sign-in  | Argon2id account hashes, per-IP and per-email rate limits, the same response for unknown emails, optional TOTP.                                                                                                  |
| Stolen session cookie                           | The vault still needs the master password. Destructive actions need the account password. Sessions can be revoked everywhere.                                                                                    |
| Other users (IDOR)                              | Every server action and query is scoped by the session user's id; ids in updates and deletes are filtered by owner. Covered by integration tests.                                                                |
| XSS                                             | React escaping, a nonce-based CSP with no `unsafe-inline` scripts, `frame-ancestors 'none'`, and `connect-src` limited to the app and HIBP.                                                                      |
| Clickjacking                                    | `frame-ancestors 'none'` and `X-Frame-Options`.                                                                                                                                                                  |
| Shoulder surfing and walk-away                  | Secrets hidden until revealed. Auto-lock after 15 minutes of inactivity or 5 minutes in a hidden tab. The clipboard is cleared 30 seconds after a copy.                                                          |
| Forgotten master password                       | The recovery key (if saved). Without it, the vault can't be recovered by anyone, including the operator.                                                                                                         |

## Attacks not covered

- **Malicious server-delivered JavaScript.** The browser trusts the code the server serves. An
  attacker who controls the server, the deployment pipeline or a dependency can ship code that
  records the master password or decrypted items the next time a user unlocks. Every web-based
  password manager has this limit. Self-hosting, reviewing changes, a committed lockfile with
  pinned versions, and an allow-list for dependency install scripts (`pnpm-workspace.yaml`)
  reduce the risk; they don't remove it.
- **A compromised device.** Malware, keyloggers, malicious browser extensions or someone with
  access to an unlocked browser can read the master password or decrypted data. KeyCrypt can't
  protect secrets on a device the attacker controls.
- **Phishing.** A look-alike site can capture the account password, the master password and TOTP
  codes. Two-factor sign-in by TOTP does not stop real-time phishing. Passkeys (WebAuthn) are a
  planned follow-up.
- **Weak master passwords.** Argon2id slows offline guessing but can't save a password that's in
  a wordlist. The setup and change forms show a strength meter (zxcvbn), but the user chooses.
- **Metadata analysis.** Item types, counts, sizes, timestamps, favourites, folder membership and
  the activity log (IP addresses, browsers) are visible to the server, as listed above.
- **Plain CSV exports and imported files.** Once a plain export, or an export from another
  password manager, is on disk, it is protected only by the device.
- **Rolling an item back to an older version.** A malicious or compromised server can serve an
  older ciphertext of the same item (for example a password you have since changed). The AAD binds
  the ciphertext to user, item and type but not to a version, so the old ciphertext decrypts and
  the browser shows it as current.
- **Withholding or deleting items.** The server can leave items, or folders, out of the list it
  returns, or delete them, and the browser can't tell: there is no authenticated list of which
  items a vault should contain.
- **Changing plain-text metadata.** Favourite flags, folder membership and the created/updated
  timestamps are stored in plain text and are not authenticated, so the server can change them
  without the browser noticing. Item types are bound by the AAD; a changed type makes decryption
  fail.
- **Denial of service and data loss.** The operator can stop serving the vault altogether. Keep
  encrypted exports as backups.
- **Side channels in the browser**, such as memory inspection while the vault is unlocked.
  JavaScript strings holding decrypted values can't be reliably wiped.

## Future work

- **Vault integrity against a malicious server.** The planned fix for rollback, withholding and
  metadata changes is a per-item version (a counter bumped on every edit) inside the item AAD, plus
  a list of the vault's items (id, type, version and the metadata above) signed or MACed with a key
  derived from the vault key and checked by the browser on every load. Until then, those attacks
  are not covered.

## Reporting

See [`SECURITY.md`](../SECURITY.md) and [`/.well-known/security.txt`](../public/.well-known/security.txt).
