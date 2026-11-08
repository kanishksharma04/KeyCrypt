# Changelog

All notable changes to KeyCrypt are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). KeyCrypt has
no tagged releases yet, so earlier entries are grouped by the date they were written up.

## [Unreleased]

### Added

- `LICENSE` file with the MIT license, and `"license": "MIT"` in `package.json` and
  `extension/package.json`
- `pnpm check:env` lists, by name only, which required (`DATABASE_URL`, `AUTH_SECRET`,
  `NEXT_PUBLIC_APP_URL`, `AUTH_URL`) and recommended (Upstash, SMTP, `EMAIL_FROM`,
  `TOTP_ENCRYPTION_KEY`) production settings are missing or malformed. Vercel production builds
  print the same report, and a production server logs it once at start-up
- Opt-in migrations for Vercel preview builds: with `PREVIEW_MIGRATIONS=1`, a preview build
  applies pending migrations to its own database first, and refuses when that database is the
  production one (`PRODUCTION_DATABASE_HOST`)
- This changelog

### Changed

- Landing page finished in its journal style (masthead, numbered sections, margin notes, a
  printed "Fig. 1" of a stored item) with IBM Plex Mono and Fraunces italics, and split into one
  component per section under `src/features/landing`
- The landing page's "What the server can see" note now also says the server can tell how many
  items you have and roughly how large each one is, as README's security table does
- README: tech stack names `hash-wasm` (Argon2id) and zxcvbn, the project structure covers
  `extension/`, `src/app/api/ext`, `e2e/`, `docs/`, `scripts/` and `prisma/migrations`, and the UI
  section describes the current design; the changelog moved here

## 2026-11-07

### Added

- **Authenticator items** — a fifth item type for TOTP setup keys and `otpauth://` links, with
  live codes; logins can hold a TOTP key too
- **Folders** — encrypted folder names; create, rename, delete, move and filter
- **Import** — Bitwarden (JSON/CSV), 1Password, LastPass, Chrome/Edge CSV and KeyCrypt encrypted
  exports, parsed and encrypted in the browser. Folders from Bitwarden and KeyCrypt exports are
  kept (matched by name, created if missing)
- **Browser extension (MVP)** — unlock locally and fill logins for the current site
- **Self-hosting** — Docker image and compose file
- Two-factor sign-in, recovery kit, account deletion, recent-activity log

### Changed

- **Export** — encrypted JSON and Bitwarden CSV now include each item's folder
- Vault health ignores logins without a password (SSO, passkey or TOTP-only accounts)
- The view dialog shows the notes of logins, API keys, WiFi and authenticator items
- Vaults are capped at 5,000 items for single creates as well as imports
- **Redesign** — warm paper/charcoal palette with a bronze accent and a serif display face
  (Fraunces); new landing page, unlock screen, vault list and dashboard (health factors with
  per-issue review, folder count, items by type, recent activity), all responsive down to phone
  widths

## 2026-08-11

### Added

- **Command palette** — `⌘K` launcher for navigation, item search, and quick actions (new item,
  lock vault, toggle theme)
- **Vault health score** — dashboard widget flagging weak (zxcvbn), reused, stale and (opt-in)
  breached passwords, computed client-side

### Fixed

- Removed the white background baked into the favicon

## 2026-06-30

### Added

- `Escape` clears and blurs the vault search input
- `/` focuses the search input from anywhere in the vault
- Copy buttons show a `✓` checkmark for 1.5 s after copying
- Password visibility toggles on sign-in, sign-up, and vault unlock forms
- View dialog for all vault item types with reveal toggles and per-field copy buttons
- Relative timestamps (`2h ago`, `3d ago`) on every item card
- Item count label — `5 items` or `2 of 5 items` when filtered
- Smart empty states with contextual messaging for favorites filter vs. search vs. empty vault
- Favorites-only filter toggle in the toolbar
- Clear (×) button on the search input
- Auto-focus name field when any create dialog opens
- Sign-out button in vault header
- User initials avatar with email tooltip
- Lock vault button
- Full PNG brand asset suite — wordmark, app icon, favicon, Apple touch icon, OG image
- Custom favicon replacing default Next.js placeholder
- OpenGraph and Twitter card metadata for rich link previews
- Full `prefers-reduced-motion` support across all animations

### Changed

- Skeleton count matches actual item count instead of a fixed 3
- Shimmer gradient skeleton replacing flat `animate-pulse`
- Staggered `fade-in-up` entrance on vault item list (35 ms delay per card)
- Hover lift (`-translate-y-px`) + icon scale on vault cards, landing feature cards, dashboard
  stat cards
- Dialog: deeper backdrop (`bg-black/40 backdrop-blur-sm`), `shadow-xl`, `slide-in-from-bottom`
  entrance, 200 ms ease
- Dropdown: `shadow-lg`, tighter `zoom-in-[0.97]`, `slide-in-from-top-1`, 150 ms ease
- Input: hover border feedback (`hover:border-ring/40`) on all text inputs
- Theme toggle: rotate crossfade animation (sun `0° → -90°`, moon `90° → 0°`)
- Settings section cards: subtle `shadow-xs` elevation layer

### Fixed

- Vault page crash caused by `useSession` without `SessionProvider` — session data now passed as
  props from the server layout
- Strength meter bars rendering on empty master password field
