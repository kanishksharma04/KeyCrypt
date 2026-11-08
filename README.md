# KeyCrypt

> Zero-knowledge encrypted password manager — your secrets never leave your browser unencrypted.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/kanishksharma04/KeyCrypt)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript)
![License](https://img.shields.io/badge/license-MIT-green)

KeyCrypt encrypts the contents of every vault item in your browser before it reaches the server, which stores them as ciphertext it cannot read without your master password. Item names are encrypted too, and searched in the browser. A little metadata stays in plain text so the server can store and order your items; the table below lists exactly what.

---

## Security model

The full [threat model](docs/threat-model.md) covers assets, attackers, trust boundaries, crypto v2 and what is (and isn't) defended. To report a vulnerability, see [SECURITY.md](SECURITY.md) (GitHub private vulnerability reporting; also in [`/.well-known/security.txt`](public/.well-known/security.txt)).

| What the server stores                                                                                                                 | What the server never sees                                        |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Ciphertext of each item's name and contents (AES-256-GCM)                                                                              | Master password                                                   |
| Random IV per item                                                                                                                     | Vault key                                                         |
| Salt, wrapped vault key (master password + recovery key), verifier                                                                     | Item names and contents (usernames, passwords, URLs, notes, keys) |
| Argon2id hash of the account password; two-factor secret (encrypted with a server key) and backup-code hashes                          | Recovery key                                                      |
| **Plain-text metadata:** item types, favourite flags, created/updated times, which folder each item is in (folder names are encrypted) |                                                                   |
| **Audit log:** account events with timestamps, IP address and browser, item type on create, export format; kept 180 days               |                                                                   |

The server also handles your email and name, your account password while you sign in, sign up,
reset it or confirm it (it stores only the Argon2id hash), the session cookie, and client IPs and
emails for rate limiting. From the ciphertext it can tell how many items you have and roughly how
large each one is. Each audit entry records the IP address and browser (user agent) of the request; you can see them under Settings → Recent activity.

**Breached-password check (opt-in).** The "Check for breached passwords" button in vault health
asks [Have I Been Pwned](https://haveibeenpwned.com/Passwords) directly from your browser. Each
password is hashed with SHA-1 in the browser and only the first 5 hex characters of the hash are
sent (k-anonymity, with response padding); the returned suffixes are compared locally. Neither
your passwords nor their full hashes leave the browser, and KeyCrypt's server is not involved.
Have I Been Pwned sees those prefixes and your IP address.

```
vaultKey   = random 256-bit AES-GCM key (generated in the browser)
kek        = Argon2id(masterPassword, salt, 64 MiB, 3 iterations, parallelism 1)
wrapped    = AES-256-GCM(kek, randomIV, vaultKey)      # what the server stores
ciphertext = AES-256-GCM(vaultKey, randomIV, plaintext)
```

The vault key exists only in this page's memory. It is never written to disk or browser storage, and it is gone when you lock, after 15 minutes of inactivity or 5 minutes in a hidden tab, or when the page is closed or reloaded.

---

## Features

### Vault item types

- **Login credentials** — username, password, URL with one-click copy and site launch
- **Secure notes** — encrypted free-form text for PINs, recovery codes, sensitive memos
- **API keys** — key, description, notes with monospace display
- **Wi-Fi passwords** — SSID, password, security type (WPA2 / WPA3 / WEP / Open)
- **Authenticators (TOTP)** — a setup key or `otpauth://` link; the vault shows the live code with a countdown (SHA-1/256/512, 6–8 digits). Logins can hold a TOTP key too, and imports from Bitwarden, 1Password and LastPass carry it over. Codes are computed in the browser

### Security & crypto

- Zero-knowledge architecture — master password never transmitted
- AES-256-GCM encryption with a unique random IV per item
- Argon2id key derivation (64 MiB, 3 iterations) in a Web Worker, wrapping a random 256-bit vault key
- Nonce-based Content Security Policy (CSP) + HSTS in production
- Auto-lock after 15 minutes of inactivity or 5 minutes in a hidden tab (also checked on wake from sleep)
- Master password change re-wraps the vault key in the browser; items are not re-encrypted

### Vault UX

- **Command palette** — `⌘K` / `Ctrl+K` for quick navigation, item search, and actions (new item, lock vault, toggle theme)
- **Vault health score** — client-side detection of weak (zxcvbn), reused, and stale passwords, plus an opt-in breached-password check (k-anonymity, Have I Been Pwned); decrypted data never leaves the browser
- **View dialog** — reveal fields with eye toggle, one-click copy with ✓ checkmark feedback
- **Password generator** — configurable length, character sets, live entropy score
- **Recovery kit** — a one-time recovery key (shown at setup, regenerable in Settings) that unlocks the vault and lets you set a new master password if you forget it
- **Export** — Settings → Export, built in the browser: an encrypted JSON file (`keycrypt-export` v1, PBKDF2 600k + AES-256-GCM under a separate export password), or a plain Bitwarden-format CSV after re-entering your account password
- **Folders** — group items into folders (create, rename, delete, move, filter; the command palette finds items by folder and jumps to a folder). Folder names are encrypted in the browser with the vault key, bound to the user and folder id
- **Browser extension (MVP)** — `extension/`: a Manifest V3 extension that unlocks the vault locally (same crypto module, key kept only in popup memory) and fills logins matching the current site. See [extension/README.md](extension/README.md)
- **Import** — Settings → Import from Bitwarden (unencrypted JSON or CSV), 1Password, LastPass and Chrome/Edge CSV, or a KeyCrypt encrypted export. The file is parsed in the browser and never uploaded; a preview shows counts per type and skipped rows, then each item is encrypted in the browser and saved in batches of 50
- **Favorites filter** — star items and filter to pinned items only
- **Search** — live filter across name, username, URL, SSID; press `/` to focus, `Escape` to clear
- **Item count** — shows `3 items` or `2 of 5 items` when filtered
- **Relative timestamps** — `2h ago`, `3d ago` on every vault card
- **Smart empty states** — contextual messaging and CTAs for empty vault, no results, no favorites
- **Auto-focus** — name field focused on every create dialog open

### Authentication

- Email + password sign-up with optional email verification
- Optional two-factor sign-in (TOTP authenticator app, 10 one-time backup codes)
- Sign out of all devices; permanent account deletion from Settings
- Password visibility toggle on sign-in, sign-up, and vault unlock forms
- Sign-out from vault header or settings
- User initials avatar derived from session

### UI & theming

- Dark / light / system theme with animated sun ↔ moon toggle
- Shimmer skeleton loading states
- Staggered card entrance animations
- Hover lift on vault cards, feature cards, and dashboard stats
- Smooth dialog fade + scale with backdrop blur
- Responsive — works on mobile and desktop

---

## Tech stack

| Layer           | Choice                                          |
| --------------- | ----------------------------------------------- |
| Framework       | Next.js 16 (App Router, React 19)               |
| Language        | TypeScript (strict)                             |
| Styling         | Tailwind CSS v4 + shadcn/ui + base-nova         |
| Auth            | Auth.js v5 (Credentials provider, JWT sessions) |
| Database        | PostgreSQL via Prisma 6 (Neon recommended)      |
| Crypto          | Web Crypto API (browser-native, zero deps)      |
| Package manager | pnpm                                            |

---

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/kanishksharma04/KeyCrypt.git
cd KeyCrypt
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# PostgreSQL — Neon connection string recommended
DATABASE_URL="postgresql://..."

# Generate a secret: openssl rand -base64 32
AUTH_SECRET="..."

# Public URL of your app
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Required for Auth.js behind a proxy
AUTH_URL="http://localhost:3000"

# Optional — enables email verification on sign-up
# Without SMTP, accounts are auto-verified immediately
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
EMAIL_FROM="KeyCrypt <noreply@yourdomain.com>"
```

### 3. Apply the database migrations

The schema is managed with Prisma Migrate (`prisma/migrations`). On a new, empty database:

```bash
pnpm db:deploy    # prisma migrate deploy — applies every pending migration
```

**Existing database created with `db:push`?** Its tables already match the baseline
migration, so mark it as applied once instead of running it:

```bash
pnpm prisma migrate resolve --applied 0_init
pnpm db:deploy    # should report "No pending migrations to apply"
```

**Changing the schema:** edit `prisma/schema.prisma`, then run `pnpm db:migrate --name <change>`
against your local dev database. This creates a new folder in `prisma/migrations`; commit it
with the schema change.

`pnpm db:push` still exists for throwaway local databases only. It skips migration history
and can drop data without asking, so never point it at a database you care about.

### 4. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scripts

```bash
pnpm dev          # Start development server (Turbopack)
pnpm build        # Production build
pnpm start        # Start production server
pnpm check:env    # List missing or malformed production settings (names only)
pnpm typecheck    # TypeScript type check
pnpm lint         # ESLint
pnpm test         # Vitest unit tests (no database)
pnpm test:integration # Server-action tests against Postgres (see below)
pnpm test:e2e     # Playwright end-to-end tests against a production build (see below)
pnpm test:docker  # Smoke test against a running Docker container (see Self-hosting)
pnpm ext:build    # Build the browser extension into extension/dist
pnpm test:extension # Load the extension unpacked in Chromium and fill a test form
pnpm db:deploy    # Apply pending migrations (prisma migrate deploy)
pnpm db:migrate   # Create + apply a new migration in development (prisma migrate dev)
pnpm db:push      # Throwaway local databases only — no migration history
pnpm db:studio    # Open Prisma Studio
```

### Checking production settings

```bash
pnpm check:env              # real environment + .env.production.local, .env.local, .env.production, .env
pnpm check:env --no-dotenv  # real environment only
pnpm check:env --warn-only  # report, but always exit 0
```

It lists, by name only, which settings are missing or malformed; it never prints a value.
**Required:** `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `AUTH_URL`.
**Recommended:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `TOTP_ENCRYPTION_KEY`. Values are checked with the same
rules as `src/lib/env.ts` (valid URLs, a 32-character `AUTH_SECRET`, a 32-byte base64
`TOTP_ENCRYPTION_KEY`, both Upstash settings or neither). It exits 1 when a required setting is
missing or any setting is malformed. The same report is printed by Vercel production builds
(`scripts/vercel-build.mjs`) and logged once when a production server starts
(`src/instrumentation.ts`); neither stops the build or the server.

### Integration tests

Server actions are tested against a real, throwaway Postgres:

```bash
docker compose -f docker-compose.test.yml up -d --wait
export DATABASE_URL_TEST=postgresql://keycrypt:keycrypt@localhost:54329/keycrypt_test
pnpm test:integration
```

The suite applies migrations (`prisma migrate deploy`) once, then truncates every table
before each test. It refuses to run unless the database name contains `test`.

### End-to-end tests

With the same test database and `DATABASE_URL_TEST` exported:

```bash
pnpm exec playwright install chromium   # once
pnpm test:e2e
```

Playwright migrates the database, runs `pnpm build && pnpm start` (production mode, so the
CSP nonce and HSTS are live) and drives Chromium through sign-up, vault setup, the login, note, API-key and WiFi
item types, lock/unlock and a master-password change; separate specs cover authenticators,
folders, import, export, recovery, two-factor sign-in and account deletion. SMTP is left unset so new accounts are
auto-verified, and rate limits are switched off with `E2E=1` + `E2E_DISABLE_RATE_LIMIT=1`.
Never set those two variables in a real deployment.

---

## Self-hosting with Docker

The repository ships a `Dockerfile` (Next.js standalone server on Node 22, Debian slim, running
as a non-root user) and a `docker-compose.yml` with PostgreSQL 16. At start-up the container
runs `prisma migrate deploy`, then starts the server.

1. Create a `.env` file next to `docker-compose.yml`:

   ```bash
   AUTH_SECRET=...            # openssl rand -base64 32
   POSTGRES_PASSWORD=...      # a long random password
   TOTP_ENCRYPTION_KEY=...    # optional, enables two-factor sign-in: openssl rand -base64 32
   APP_URL=https://vault.example.com   # optional, default http://localhost:3000
   APP_PORT=3000              # optional, host port
   ```

2. Build and start:

   ```bash
   docker compose up -d --build --wait
   ```

3. Open `APP_URL` and create an account.

| Variable                                                         | Required | Notes                                                                                                                                  |
| ---------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`                                                    | yes      | Signs sessions and re-auth cookies. `openssl rand -base64 32`                                                                          |
| `POSTGRES_PASSWORD`                                              | yes      | Password of the bundled Postgres; `DATABASE_URL` is built from it                                                                      |
| `APP_URL`                                                        | no       | Public URL. Used for `AUTH_URL` and baked into the build as `NEXT_PUBLIC_APP_URL`, so **rebuild** (`--build`) after changing it        |
| `TOTP_ENCRYPTION_KEY`                                            | no       | 32 random bytes, base64. Without it two-factor sign-in is unavailable. Changing it breaks existing 2FA codes (backup codes still work) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`             | no       | Shared rate-limit store. Not needed for a single container                                                                             |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | no       | Email verification and password reset. Without SMTP, new accounts are verified automatically                                           |

Things to know:

- **HTTPS is required** beyond `localhost`: browsers only expose the Web Crypto API (which does all
  vault encryption) on `https://` or `localhost`. Put the container behind a TLS-terminating
  reverse proxy (Caddy, Traefik, nginx) and set `APP_URL` to the `https://` address.
- **Rate limiting** falls back to an in-memory store when Upstash isn't configured. That's fine
  for **one** app container (limits reset when it restarts, and a warning is logged at start-up);
  run more than one instance only with Upstash.
- **Backups**: the database lives in the `pgdata` volume. Back it up (`pg_dump`) and keep
  encrypted exports (Settings → Export). The operator can't decrypt vaults, so neither can a
  backup.
- **Updating**: `git pull && docker compose up -d --build --wait`. New migrations are applied when
  the container starts (`SKIP_MIGRATIONS=1` turns that off).
- **Smoke test** a running instance: `DOCKER_APP_URL=http://localhost:3000 pnpm test:docker`
  (creates a throwaway account).

---

## Deploying to Vercel

1. Push to GitHub and import the repo in the [Vercel dashboard](https://vercel.com/new).
2. Set these environment variables:

| Variable                   | Value                                            |
| -------------------------- | ------------------------------------------------ |
| `DATABASE_URL`             | Neon pooler connection string                    |
| `AUTH_SECRET`              | `openssl rand -base64 32`                        |
| `AUTH_URL`                 | `https://your-app.vercel.app`                    |
| `AUTH_TRUST_HOST`          | `true`                                           |
| `NEXT_PUBLIC_APP_URL`      | `https://your-app.vercel.app`                    |
| `UPSTASH_REDIS_REST_URL`   | Upstash Redis REST URL (optional, recommended)   |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token (optional, recommended) |
| `TOTP_ENCRYPTION_KEY`      | `openssl rand -base64 32` (enables 2FA)          |

3. Deploy. Production builds run `pnpm vercel-build` (`scripts/vercel-build.mjs`), which
   applies pending migrations with `prisma migrate deploy` before `next build`, over the
   direct connection (`DIRECT_URL` if set, otherwise the Neon pooler URL without
   `-pooler`). `pnpm build` itself never migrates. If the database was created with
   `db:push`, the build baselines `0_init` automatically (only when that is the sole
   failure); by hand it is
   `DATABASE_URL=<direct connection string> pnpm prisma migrate resolve --applied 0_init`.
   The build log also lists missing production settings by name (`pnpm check:env`).

### Migrating preview deployments

Preview builds skip migrations unless you opt in. Opted in, each preview build applies the
branch's pending migrations to a **separate preview database** before `next build`, so a new
migration runs somewhere real before it reaches production. Set these in Vercel for the
**Preview** environment only:

| Variable                   | Value                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | A database just for previews, e.g. a Neon branch (`DIRECT_URL` optional, as in production)        |
| `PREVIEW_MIGRATIONS`       | `1`                                                                                               |
| `PRODUCTION_DATABASE_HOST` | The **production** database's host name, e.g. `ep-xyz-123.eu-central-1.aws.neon.tech` (no secret) |

The build compares that host with the preview's `DATABASE_URL` and migration connection
(ignoring Neon's `-pooler` suffix) and **fails without migrating** if they match, if
`PRODUCTION_DATABASE_HOST` is missing, or if the preview `DATABASE_URL` is missing. Without
`PREVIEW_MIGRATIONS=1`, previews build without migrating, as before; don't opt in while
Preview still shares the production database. Connection strings are never printed. The
logic is `planMigrations()` in `scripts/lib/migration-plan.mjs`.

---

## Changelog

### November 2026

- **Authenticator items** — a fifth item type for TOTP setup keys and `otpauth://` links, with live codes; logins can hold a TOTP key too
- **Folders** — encrypted folder names; create, rename, delete, move and filter
- **Import** — Bitwarden (JSON/CSV), 1Password, LastPass, Chrome/Edge CSV and KeyCrypt encrypted exports, parsed and encrypted in the browser. Folders from Bitwarden and KeyCrypt exports are kept (matched by name, created if missing)
- **Export** — encrypted JSON and Bitwarden CSV now include each item's folder
- **Browser extension (MVP)** — unlock locally and fill logins for the current site
- **Self-hosting** — Docker image and compose file
- Two-factor sign-in, recovery kit, account deletion, recent-activity log
- Vault health ignores logins without a password (SSO, passkey or TOTP-only accounts)
- The view dialog shows the notes of logins, API keys, WiFi and authenticator items
- Vaults are capped at 5,000 items for single creates as well as imports
- **Redesign** — warm paper/charcoal palette with a bronze accent and a serif display face (Fraunces); new landing page, unlock screen, vault list and dashboard (health factors with per-issue review, folder count, items by type, recent activity), all responsive down to phone widths

### August 11, 2026

- **Command palette** — `⌘K` launcher for navigation, item search, and quick actions (new item, lock vault, toggle theme)
- **Vault health score** — dashboard widget flagging weak (zxcvbn), reused, stale and (opt-in) breached passwords, computed client-side
- Removed the white background baked into the favicon

### June 30, 2026

#### New interactions

- `Escape` clears and blurs the vault search input
- `/` focuses the search input from anywhere in the vault
- Copy buttons show a `✓` checkmark for 1.5 s after copying
- Password visibility toggles on sign-in, sign-up, and vault unlock forms
- View dialog for all vault item types with reveal toggles and per-field copy buttons

#### Vault list improvements

- Relative timestamps (`2h ago`, `3d ago`) on every item card
- Item count label — `5 items` or `2 of 5 items` when filtered
- Smart empty states with contextual messaging for favorites filter vs. search vs. empty vault
- Skeleton count matches actual item count instead of a fixed 3
- Favorites-only filter toggle in the toolbar
- Clear (×) button on the search input
- Auto-focus name field when any create dialog opens

#### Header & navigation

- Sign-out button in vault header
- User initials avatar with email tooltip
- Lock vault button

#### Brand & assets

- Full PNG brand asset suite — wordmark, app icon, favicon, Apple touch icon, OG image
- Custom favicon replacing default Next.js placeholder
- OpenGraph and Twitter card metadata for rich link previews

#### Bug fixes

- Fixed vault page crash caused by `useSession` without `SessionProvider` — session data now passed as props from the server layout
- Fixed strength meter bars rendering on empty master password field

#### Premium UI polish

- Shimmer gradient skeleton replacing flat `animate-pulse`
- Staggered `fade-in-up` entrance on vault item list (35 ms delay per card)
- Hover lift (`-translate-y-px`) + icon scale on vault cards, landing feature cards, dashboard stat cards
- Dialog: deeper backdrop (`bg-black/40 backdrop-blur-sm`), `shadow-xl`, `slide-in-from-bottom` entrance, 200 ms ease
- Dropdown: `shadow-lg`, tighter `zoom-in-[0.97]`, `slide-in-from-top-1`, 150 ms ease
- Input: hover border feedback (`hover:border-ring/40`) on all text inputs
- Theme toggle: rotate crossfade animation (sun `0° → -90°`, moon `90° → 0°`)
- Settings section cards: subtle `shadow-xs` elevation layer
- Full `prefers-reduced-motion` support across all animations

---

## Project structure

```
src/
├── app/                    # Next.js App Router pages & layouts
│   ├── auth/               # Sign-in, sign-up, forgot/reset password, verify email
│   ├── vault/
│   │   ├── (app)/          # Authenticated vault — list, dashboard, settings
│   │   └── (gate)/         # Vault setup & unlock screens
│   ├── layout.tsx          # Root layout with CSP nonce + OG metadata
│   └── page.tsx            # Public landing page
├── components/
│   ├── shared/             # ThemeToggle, KeyCryptLogo, PageHeader
│   └── ui/                 # shadcn/ui primitives — Button, Input, Dialog, Command, …
├── features/
│   ├── auth/               # Sign-in/up forms, field errors, forgot/reset password
│   └── vault/              # VaultList, VaultHeader, CommandPalette, VaultHealthScore, item dialogs, password generator
├── lib/
│   ├── auth.ts             # Auth.js configuration (Credentials provider, JWT sessions)
│   ├── crypto/             # Web Crypto API — key derivation, encryption, verification (sole encryption surface)
│   ├── vault-health.ts     # Client-side weak/reused/stale/breached password scoring
│   ├── rate-limit.ts       # Rate limiting (Upstash Redis, in-memory fallback)
│   └── db.ts               # Prisma client singleton
├── providers/              # ThemeProvider, VaultLockProvider, CommandPaletteProvider
├── schemas/                # Zod schemas for vault items and auth forms
├── server/                 # Server actions — vault CRUD, auth, settings
└── types/                  # Shared TypeScript types
```

---

## License

MIT © [Kanishk Sharma](https://github.com/kanishksharma04)
