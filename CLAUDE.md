# CLAUDE.md

KeyCrypt is a zero-knowledge password manager. The server stores only ciphertext;
all vault encryption and decryption happens in the browser.

## Stack

- Next.js 16.2 (App Router), React 19.2, TypeScript 5 (`strict` + `noUncheckedIndexedAccess`)
- Tailwind CSS v4 + shadcn/ui (`src/components/ui`)
- Prisma 6 + PostgreSQL (`prisma/schema.prisma`)
- Auth.js v5 beta (`next-auth`), Credentials provider, JWT sessions, Prisma adapter
- Web Crypto API for vault crypto; `@node-rs/argon2` for account password hashing
- Zod 3 + react-hook-form for validation; Vitest 4 for tests; pnpm as package manager

## Security model

- **Account password** (sign-in): hashed server-side with Argon2id via
  `@node-rs/argon2` (`src/lib/password.ts`; memoryCost 19456, timeCost 2).
- **Master password** (vault): never leaves the browser and is never sent to the server.
- **Vault key**: derived in the browser with PBKDF2-SHA-256, 600,000 iterations,
  16-byte random salt, into an AES-256-GCM `CryptoKey` that is **non-extractable**
  (`src/lib/crypto/key-derivation.ts`).
- The vault key is held only in memory (`src/lib/crypto/vault-key.ts`) and cleared on lock.
  It is never persisted or sent anywhere.
- Every encryption uses a fresh random 96-bit IV; payloads are `{ ciphertext, iv }` in base64.
- **Verification blob**: a known plaintext encrypted with the vault key and stored in
  `VaultMeta` (`verificationBlob` + `verificationIv`) alongside the salt. Unlock decrypts
  it client-side to check the master password (`src/lib/crypto/verification.ts`);
  nothing is compared on the server.
- `VaultItem` stores `ciphertext` + `iv`. Only the item `name`, `type` and `favorite`
  flag are plaintext (for listing and search); usernames, passwords, URLs and notes
  live inside the ciphertext.

## Hard rules

1. All cryptography lives in `src/lib/crypto`. Import it **only** via
   `@/lib/crypto` (`index.ts`), never from sub-modules.
2. The server must never receive the master password, the vault key, or decrypted
   secrets. Server actions accept and return ciphertext only.
3. Every server action (`src/server/*`, `"use server"`) calls `auth()`, returns early
   when there is no session, and scopes **every** Prisma query by `session.user.id`
   (put `userId` in the `where` clause for updates/deletes to prevent IDOR).
4. Validate untrusted input with Zod schemas from `src/schemas`. Auth actions do this
   with `safeParse`; vault/settings actions currently take typed params, so add Zod
   validation when you touch them.
5. Never use `Math.random` for anything secret. Use `crypto.getRandomValues` in the
   browser (`src/lib/crypto`) or Node's `randomBytes` on the server (`src/lib/tokens.ts`).
6. Don't log or toast secrets, keys or decrypted data. Write security-relevant events
   to `AuditLog` without secret content.
7. Respect `noUncheckedIndexedAccess`: handle `undefined` from indexed access instead of
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
    `InvalidProvider`; `signInAction` only does validation and rate limiting. The form
    checks `result.error`, not `result.ok`, because both outcomes return `ok: true`.
  - `src/lib/auth.ts` uses the JWT session strategy (required by the Credentials
    provider), so the `Session` table is unused.
- `next-auth` declares a `nodemailer` ^7 peer dependency; the app uses nodemailer 9, so
  pnpm reports an unmet peer warning.

## Folder map

```
prisma/schema.prisma   User, Account, Session, VaultMeta, VaultItem, AuditLog, ...
prisma/migrations/     Prisma Migrate history (0_init = baseline)
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
  proxy.ts             Next 16 "proxy" (ex-middleware): route guards + per-request CSP nonce
```

Tests live next to code in `__tests__` folders. Unit tests match `src/**/*.test.ts`;
database-backed tests are `*.integration.test.ts` and use the helpers in
`src/test/integration` (`createTestUser`, `signInAs` to mock `auth()`; tables are
truncated before each test).
