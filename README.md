# KeyCrypt

> Zero-knowledge encrypted password manager — your secrets never leave your browser unencrypted.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/kanishksharma04/KeyCrypt)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript)
![License](https://img.shields.io/badge/license-MIT-green)

KeyCrypt encrypts everything in your browser before it reaches the server. We store only ciphertext — mathematically impossible to read without your master password.

---

## Security model

| What the server stores   | What the server never sees |
| ------------------------ | -------------------------- |
| Ciphertext (AES-256-GCM) | Master password            |
| Random IV per item       | Vault key                  |
| PBKDF2 salt              | Decrypted secrets          |
| Argon2id password hash   | Raw session tokens         |

```
vaultKey   = PBKDF2(masterPassword, salt, 600_000 iterations, SHA-256, 256-bit)
ciphertext = AES-256-GCM(vaultKey, randomIV, plaintext)
```

The vault key lives **only in browser memory**. It is cleared on lock, inactivity timeout (15 min), or tab close.

---

## Features

### Vault item types

- **Login credentials** — username, password, URL with one-click copy and site launch
- **Secure notes** — encrypted free-form text for PINs, recovery codes, sensitive memos
- **API keys** — key, description, notes with monospace display
- **Wi-Fi passwords** — SSID, password, security type (WPA2 / WPA3 / Open)

### Security & crypto

- Zero-knowledge architecture — master password never transmitted
- AES-256-GCM encryption with a unique random IV per item
- PBKDF2-SHA-256 key derivation at 600,000 iterations
- Nonce-based Content Security Policy (CSP) + HSTS in production
- Auto-lock after 15 minutes of inactivity
- Master password change with full client-side re-encryption of every item

### Vault UX

- **View dialog** — reveal fields with eye toggle, one-click copy with ✓ checkmark feedback
- **Password generator** — configurable length, character sets, live entropy score
- **Favorites filter** — star items and filter to pinned items only
- **Search** — live filter across name, username, URL, SSID; press `/` to focus, `Escape` to clear
- **Item count** — shows `3 items` or `2 of 5 items` when filtered
- **Relative timestamps** — `2h ago`, `3d ago` on every vault card
- **Smart empty states** — contextual messaging and CTAs for empty vault, no results, no favorites
- **Auto-focus** — name field focused on every create dialog open

### Authentication

- Email + password sign-up with optional email verification
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

| Layer           | Choice                                     |
| --------------- | ------------------------------------------ |
| Framework       | Next.js 16 (App Router, React 19)          |
| Language        | TypeScript (strict)                        |
| Styling         | Tailwind CSS v4 + shadcn/ui + base-nova    |
| Auth            | Auth.js v5 (JWT sessions)                  |
| Database        | PostgreSQL via Prisma 6 (Neon recommended) |
| Crypto          | Web Crypto API (browser-native, zero deps) |
| Package manager | pnpm                                       |

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

### 3. Push the database schema

```bash
pnpm db:push
```

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
pnpm typecheck    # TypeScript type check
pnpm lint         # ESLint
pnpm db:push      # Push Prisma schema to database
pnpm db:studio    # Open Prisma Studio
```

---

## Deploying to Vercel

1. Push to GitHub and import the repo in the [Vercel dashboard](https://vercel.com/new).
2. Set these environment variables:

| Variable              | Value                         |
| --------------------- | ----------------------------- |
| `DATABASE_URL`        | Neon pooler connection string |
| `AUTH_SECRET`         | `openssl rand -base64 32`     |
| `AUTH_URL`            | `https://your-app.vercel.app` |
| `AUTH_TRUST_HOST`     | `true`                        |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` |

3. Deploy.

---

## Changelog

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
│   └── ui/                 # shadcn/ui primitives — Button, Input, Dialog, …
├── features/
│   ├── auth/               # Sign-in/up forms, field errors, forgot/reset password
│   └── vault/              # VaultList, VaultHeader, item dialogs, password generator
├── lib/
│   ├── auth.ts             # Auth.js configuration
│   ├── crypto.ts           # Web Crypto API — key derivation, encrypt, decrypt
│   └── db.ts               # Prisma client singleton
├── providers/              # ThemeProvider, VaultLockProvider
├── schemas/                # Zod schemas for vault items and auth forms
├── server/                 # Server actions — vault CRUD, auth, settings
└── types/                  # Shared TypeScript types
```

---

## License

MIT © [Kanishk Sharma](https://github.com/kanishksharma04)
