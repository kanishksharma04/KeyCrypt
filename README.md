# KeyCrypt

A zero-knowledge encrypted password manager. Everything is encrypted in your browser before it touches the server — we store only ciphertext and never see your master password or vault key.

## Features

- **Zero-knowledge architecture** — master password never leaves your device
- **AES-256-GCM encryption** with a unique random IV per vault item
- **PBKDF2-SHA-256** key derivation at 600,000 iterations
- **Four item types** — Login credentials, Secure notes, API keys, Wi-Fi passwords
- **Password generator** with configurable length, character sets, and live entropy score
- **Auto-lock** after 15 minutes of inactivity or on tab close
- **Session management** — view and revoke active sessions per device
- **Master password change** with full client-side re-encryption
- **Audit log** for all auth and vault events
- **Dark / light / system theme**
- **Nonce-based CSP** and HSTS in production

## Tech stack

| Layer           | Choice                                     |
| --------------- | ------------------------------------------ |
| Framework       | Next.js 16 (App Router, React 19)          |
| Language        | TypeScript (strict)                        |
| Styling         | Tailwind CSS v4 + shadcn/ui                |
| Auth            | Auth.js v5 (database sessions)             |
| Database        | PostgreSQL via Prisma 6 (Neon recommended) |
| Crypto          | Web Crypto API (browser-only)              |
| Testing         | Vitest                                     |
| Package manager | pnpm                                       |

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/kanishksharma04/KeyCrypt.git
cd KeyCrypt
pnpm install
```

### 2. Set environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
# PostgreSQL — Neon connection string recommended
DATABASE_URL="postgresql://..."

# Generate with: openssl rand -base64 32
AUTH_SECRET="..."

# Your app's public URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Required for Auth.js on Vercel / behind a proxy
AUTH_URL="http://localhost:3000"

# Optional — enables email verification on sign-up
# Without these, accounts are auto-verified immediately after registration
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

## Scripts

```bash
pnpm dev          # Start development server
pnpm build        # Production build
pnpm start        # Start production server
pnpm typecheck    # TypeScript type check
pnpm lint         # ESLint
pnpm test         # Run all tests (Vitest)
pnpm db:push      # Push schema to database
pnpm db:studio    # Open Prisma Studio
```

## Deploying to Vercel

1. Push to GitHub and import the repo in Vercel.
2. Set these environment variables in the Vercel dashboard:

| Variable              | Value                                    |
| --------------------- | ---------------------------------------- |
| `DATABASE_URL`        | Your Neon connection string (pooler URL) |
| `AUTH_SECRET`         | `openssl rand -base64 32`                |
| `AUTH_URL`            | `https://your-app.vercel.app`            |
| `AUTH_TRUST_HOST`     | `true`                                   |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app`            |

3. Deploy.

## Security model

| What the server stores      | What the server never sees |
| --------------------------- | -------------------------- |
| Ciphertext (AES-256-GCM)    | Master password            |
| Random IV per item          | Vault key                  |
| PBKDF2 salt                 | Decrypted secrets          |
| Argon2id auth-password hash | Raw session tokens         |

Key derivation: `vaultKey = PBKDF2(masterPassword, salt, 600_000, SHA-256, 256-bit)`

Each vault item: `ciphertext = AES-256-GCM(vaultKey, randomIV, plaintext)`

The vault key lives only in browser memory and is cleared on lock, timeout, or tab close.

## License

MIT
