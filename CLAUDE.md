# CLAUDE.md

KeyCrypt is a zero-knowledge password manager. Item names and contents reach the server only
as ciphertext (a little metadata is plain text, see "Security model"); all vault encryption
and decryption happens in the browser.

## Stack

- Next.js 16.2 (App Router), React 19.2, TypeScript 5 (`strict` + `noUncheckedIndexedAccess`)
- Tailwind CSS v4 + shadcn/ui (`src/components/ui`)
- Prisma 6 + PostgreSQL (`prisma/schema.prisma`)
- Auth.js v5 beta (`next-auth`), Credentials provider, JWT sessions, Prisma adapter
- Web Crypto API for vault crypto, `hash-wasm` (Argon2id, browser) for the vault KEK;
  `@node-rs/argon2` for account password hashing on the server
- Zod 3 + react-hook-form for validation; Vitest 4 for tests; pnpm as package manager

## Security model

- **Account password** (sign-in): hashed server-side with Argon2id via
  `@node-rs/argon2` (`src/lib/password.ts`; memoryCost 19456, timeCost 2).
- **Two-factor sign-in (TOTP)**: optional, protects the account (not the vault). The TOTP
  secret is encrypted on the server with AES-256-GCM under `TOTP_ENCRYPTION_KEY` (AAD bound to
  the user id; `encryptTotpSecret` in `src/lib/crypto/totp.ts`), `User.totpEnabledAt` marks it
  on, and `User.totpBackupCodes` holds Argon2 hashes of 10 one-time backup codes, consumed
  atomically (`src/lib/two-factor.ts`). `authorize()` throws `TOTP_REQUIRED` /
  `TOTP_INVALID` after the password check; code attempts are rate limited per user. Turning
  it on or off needs a recent account-password confirmation; disabling also needs a code.
- **Sessions**: Auth.js JWTs, 7-day max age, revocable by bumping `User.tokenVersion`
  (checked at most every 60 s in the jwt callback, `src/lib/session-version.ts`).
  "Sign out of all devices" and password reset both bump it.
- **Master password** (vault): never leaves the browser and is never sent to the server.
- **Vault key (crypto v2)**: a random AES-256-GCM key, stored on the server only
  **wrapped** (AES-GCM) under a key-encryption key derived in the browser from the master
  password and a 16-byte salt with **Argon2id** (64 MiB, 3 iterations, parallelism 1;
  `hash-wasm` in a Web Worker, `src/lib/crypto/kdf.ts`) (`src/lib/crypto/key-wrapping.ts`).
  `VaultMeta.kdf`/`kdfParams` record the KDF; the server only accepts Argon2id for new
  writes, and the browser bounds-checks stored params before deriving. The CSP allows
  `'wasm-unsafe-eval'` (WebAssembly only) for this. In memory it is always
  **non-extractable**; a short-lived extractable copy is unwrapped only to re-wrap it.
  Changing the master password re-wraps the key; items are untouched. `VaultMeta.cryptoVersion`
  1 vaults (vaultKey = PBKDF2(master, salt)) are upgraded on unlock (`upgradeVaultAction`,
  needs a recent account-password confirmation); an unlocked vault is always v2.
  Browser-side flows live in `src/features/vault/vault-crypto.ts`.
- **Password strength / breaches**: `estimatePasswordStrength` (`@/lib/crypto`) is the one
  strength function for typed passwords; it uses zxcvbn (`@zxcvbn-ts/*`, lazy-loaded via
  `loadPasswordStrengthEstimator()`) and a character-class estimate until it loads. The opt-in
  breached-password check (`countPasswordBreaches`, `src/lib/crypto/breach.ts`) sends only the
  first 5 hex chars of each SHA-1 to `api.pwnedpasswords.com/range/` (with `Add-Padding`) from
  the browser, the only external origin in the CSP `connect-src`.
- The vault key is held only in memory (`src/lib/crypto/vault-key.ts`) and cleared on lock.
  It is never persisted or sent anywhere.
- **Offline copy (PWA)**: after each online vault load, `OfflineSnapshot` stores the encrypted
  vault (unlock metadata + item ciphertext, whitelisted; no keys, no recovery copy, no plaintext)
  in IndexedDB (`src/features/vault/offline-cache.ts`); `/offline` unlocks it read-only. Cleared on
  sign-out, account deletion, sign out of all devices and on the sign-in page. The service worker
  (`public/sw.js`) caches only the app shell, `/offline` and `/_next/static`.
- Every encryption uses a fresh random 96-bit IV; payloads are `{ ciphertext, iv }` in base64.
- **Recovery kit (v2)**: a random 128-bit recovery key (grouped base32, shown once at setup
  and from Settings) derives a second KEK with HKDF-SHA-256 bound to the user id
  (`src/lib/crypto/recovery.ts`); `VaultMeta.recoveryWrappedKey`/`recoveryIv` hold the same
  vault key wrapped under it. "Use recovery key" on the unlock page sets a new master password
  (`recoverVaultAction`); creating/replacing a key uses `setRecoveryKeyAction`. Both need a
  recent account-password confirmation; audit `vault.recovery.created` / `vault.recovery.used`.
- **Item AAD (v2)**: every item is encrypted with associated data
  `"kc:v2|" + userId + "|" + itemId + "|" + type` (`itemAad()` in `src/lib/crypto/aad.ts`), so
  a ciphertext only decrypts in its own row. Item ids are generated in the browser
  (`generateItemId()`, UUID v4) before encryption; the server validates the format and
  rejects duplicates. Client code gets the user id from `useVaultUserId()`
  (`src/providers/vault-user-provider.tsx`).
- **Folders**: `Folder` stores only `nameCiphertext`/`nameIv`: the name is encrypted with the
  vault key and AAD `"kc:v2-folder|" + userId + "|" + folderId` (`folderAad()`), with the id
  generated in the browser (`sealFolderName` in `src/features/vault/folder-payload.ts`).
  `VaultItem.folderId` is a plain-text relation (`onDelete: SetNull`). Actions in
  `src/server/folder-actions.ts`.
- **Verification blob**: a known plaintext encrypted with the vault key and stored in
  `VaultMeta` (`verificationBlob` + `verificationIv`) alongside the salt. Unlock decrypts
  it client-side to check the master password (`src/lib/crypto/verification.ts`);
  nothing is compared on the server.
- `VaultItem` stores `ciphertext` + `iv`. The v2 payload is `{ name, secret }`: item **names
  are encrypted** with the secret (`sealItem`/`openItem` in `src/features/vault/item-payload.ts`)
  and `VaultItem.name` is null; names are decrypted, searched and sorted in the browser
  (vault list, command palette, health). Server-visible plain text: item `type`, `favorite`,
  `folderId`, `createdAt`/`updatedAt`, `deletedAt` (Trash: set when an item is trashed; trashed items are
  hidden everywhere but `/vault/trash` and purged after 30 days by the daily cron). `AuditLog` stores actions with timestamps, IP and user agent (always
  via `logAudit()` in `src/lib/audit.ts`; entries older than 180 days are deleted by the daily
  cron `GET /api/cron/prune-audit` (`CRON_SECRET`, `vercel.json`) and, without a scheduler, by
  `logAudit()` at most once a day per process),
  item type on create and export format; shown in Settings → Recent activity. Keep README's security table and
  the landing page's "What the server can see today" note in sync with any change here.

## Hard rules

1. All cryptography lives in `src/lib/crypto`. Import it **only** via
   `@/lib/crypto` (`index.ts`), never from sub-modules. The browser extension imports the same
   `index.ts` as `keycrypt/crypto` (workspace package).
2. The server must never receive the master password, the vault key, or decrypted
   secrets. Server actions accept and return ciphertext only.
3. Every server action (`src/server/*`, `"use server"`) calls `auth()`, returns early
   when there is no session, and scopes **every** Prisma query by `session.user.id`
   (put `userId` in the `where` clause for updates/deletes to prevent IDOR).
4. Every exported server action `safeParse`s its input first (schemas in
   `src/schemas/server.ts` and `src/schemas/auth.ts`) and returns
   `{ error: "Invalid input" }` without echoing the input.
5. Destructive actions (master-password change, sign out all devices, plain CSV export via
   `recordVaultExportAction("csv")`, TOTP setup/disable, and account deletion via
   `deleteAccountAction`) call `requireRecentReauth(userId)` from `src/lib/reauth.ts` right
   after `auth()`. The UI asks first with `ConfirmPasswordDialog` (account password).
6. Never use `Math.random` for anything secret. Use `crypto.getRandomValues` in the
   browser (`src/lib/crypto`) or Node's `randomBytes` on the server (`src/lib/tokens.ts`).
7. Don't log or toast secrets, keys or decrypted data. Write security-relevant events
   to `AuditLog` without secret content.
8. Respect `noUncheckedIndexedAccess`: handle `undefined` from indexed access instead of
   silencing it.

## Commands

```bash
pnpm dev             # next dev
pnpm build           # prisma generate && next build
pnpm start           # next start
pnpm typecheck       # tsc --noEmit
pnpm lint            # eslint   (lint:fix to autofix)
pnpm format          # prettier --write .   (format:check to verify)
pnpm test            # vitest run, unit tests only, no database (test:watch, test:coverage)
pnpm test:integration # server actions vs real Postgres; needs DATABASE_URL_TEST (see README)
pnpm test:e2e        # Playwright vs a production build (e2e/); needs DATABASE_URL_TEST
pnpm db:generate     # prisma generate
pnpm db:deploy       # prisma migrate deploy (apply pending migrations)
pnpm db:migrate      # prisma migrate dev (create a migration; dev DB only)
pnpm db:push         # prisma db push — throwaway local DBs only
pnpm db:studio       # prisma studio
```

Database changes go through Prisma Migrate (`prisma/migrations`, baseline `0_init`):
edit the schema, run `pnpm db:migrate --name <change>` locally, and commit the new
migration folder with the schema change. Never use `db:push` on a database with data;
it can drop columns without asking. To adopt migrations on an existing `db:push`
database, run `pnpm prisma migrate resolve --applied 0_init` once. Never run Prisma
commands against production unless explicitly asked.

Before committing, `pnpm typecheck`, `pnpm lint` and `pnpm test` must all pass.

Environment variables: see `.env.example` (`DATABASE_URL`, `AUTH_SECRET`,
`NEXT_PUBLIC_APP_URL`, optional `SMTP_*`).

## Commits and hooks

- Conventional Commits, enforced by commitlint (`@commitlint/config-conventional`)
  through the husky `commit-msg` hook.
- husky `pre-commit` runs lint-staged: `eslint --fix` + `prettier --write` on TS files,
  `prettier --write` on JS/JSON/CSS/MD.
- Never bypass hooks with `--no-verify`.

## Dependencies

- Auth.js is a beta and stays **pinned to exact versions** (`next-auth` 5.0.0-beta.31,
  `@auth/prisma-adapter` 2.11.2) — no `^`/`~` ranges. Upgrade only after checking the
  sign-in flow by hand: sign up, verify email, sign in (correct password, wrong password,
  unverified email), sign out, then unlock the vault.
- Things an upgrade can break:
  - `src/features/auth/sign-in-form.tsx` signs in with client-side `signIn("credentials")`
    from `next-auth/react` because calling it from a server action raised
    `InvalidProvider`. All checks, including the per-IP and per-email rate limits, run
    in `authorize()` (`src/lib/authorize-credentials.ts`). The form checks
    `result.error`/`result.code`, not `result.ok`, because both outcomes return `ok: true`.
  - `src/lib/auth.ts` uses the JWT session strategy (required by the Credentials
    provider), so the `Session` table is unused.
- `next-auth` declares a `nodemailer` ^7 peer dependency; the app uses nodemailer 9, so
  pnpm reports an unmet peer warning.

## Folder map

```
prisma/schema.prisma   User, Account, Session, VaultMeta, VaultItem, AuditLog, ...
prisma/migrations/     Prisma Migrate history (0_init = baseline)
extension/             browser extension (pnpm workspace package; imports keycrypt/crypto)
src/
  app/                 App Router routes
    auth/              signin, signup, verify-email, forgot/reset-password, error
    vault/(gate)/      setup, unlock (master password screens)
    vault/(app)/       dashboard, settings (unlocked vault)
    api/auth/          Auth.js route handler
  components/ui/       shadcn/ui primitives
  components/shared/   app-wide shared components
  features/            feature UI (auth forms, vault dialogs/list/generator)
  lib/crypto/          ALL crypto (public API in index.ts) + __tests__
  lib/                 auth.ts, db.ts, password.ts, tokens.ts, email.ts, rate-limit.ts, ...
  providers/           theme, vault lock, command palette
  schemas/             Zod schemas (auth, vault)
  server/              server actions (auth, vault, vault items, settings)
  types/               shared types, next-auth augmentation
  app/api/ext/         JSON API for the browser extension (session cookie, ciphertext only)
  proxy.ts             Next 16 "proxy" (ex-middleware): verifies the session JWT with the
                       edge-safe lib/auth.config.ts (no Prisma), route guards, CSP nonce
```

Tests live next to code in `__tests__` folders. Unit tests match `src/**/*.test.ts`;
database-backed tests are `*.integration.test.ts` and use the helpers in
`src/test/integration` (`createTestUser`, `signInAs` to mock `auth()`; tables are
truncated before each test).
