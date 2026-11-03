# KeyCrypt browser extension (MVP)

A Manifest V3 extension for Chrome and other Chromium browsers. It unlocks your KeyCrypt vault
**locally** with your master password and fills saved logins on the site you're on.

It is a pnpm workspace package: the vault cryptography is the web app's own module
(`src/lib/crypto`, imported as `keycrypt/crypto`), not a copy.

## Build and load it unpacked

```bash
# from the repository root
pnpm install
KEYCRYPT_APP_URL=http://localhost:3000 pnpm ext:build   # your KeyCrypt URL; default http://localhost:3000
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose `extension/dist`.
3. Pin KeyCrypt to the toolbar.

`KEYCRYPT_APP_URL` is baked into the build: it becomes the extension's only host permission and the
server the popup talks to. Rebuild (and reload the extension) if it changes.

## Using it

1. Sign in to KeyCrypt in the same browser profile (the extension uses that session cookie).
2. On a login page, click the KeyCrypt toolbar icon and enter your **master password**.
3. Logins saved for that site are listed; click one to fill the username and password.

## How it works

- `GET /api/ext/vault-meta` and `GET /api/ext/items?type=LOGIN` (in the web app) return your
  vault's salt, KDF parameters, wrapped vault key and item **ciphertext**, authenticated with your
  session cookie and scoped to your account.
- The popup derives the key-encryption key with Argon2id (WebAssembly, in a worker), unwraps the
  vault key and decrypts the logins, all locally. The vault key is a non-extractable `CryptoKey`
  held **only in the popup's memory**: it is gone when the popup closes. The extension has no
  `storage` permission and writes nothing to `chrome.storage`.
- A login matches when its URL's host is the tab's host, or the tab is on a subdomain of it
  (`example.com` matches `login.example.com`, never `evil-example.com`). Only `https://` pages are
  filled, plus `http://localhost` and `http://127.0.0.1`.
- Filling uses `chrome.scripting.executeScript` on the active tab (`activeTab` permission, granted
  by your click). The injected function refuses to fill if the page has moved to another host, and
  fills the password field plus the username field next to it.

Permissions: `activeTab`, `scripting`, and host access to the KeyCrypt app origin only.

## Current limitations

- **Chromium only.** Firefox isn't supported yet.
- **Unlock every time** the popup opens (the key isn't kept between openings).
- **Fill only.** It doesn't save new logins or update changed passwords, and doesn't fill
  authenticator (TOTP) codes.
- Top frame only (no logins inside iframes), and the first visible password field on the page.
- Site matching uses hosts, not the public suffix list, and has no per-login match rules.
- Vaults still on crypto v1 must be unlocked once in the web app (to upgrade) first.
- No icon set or store packaging yet.

## Tests

- Unit: `extension/src/*.test.ts` (run by `pnpm test` at the root).
- End to end: `pnpm test:extension` builds a test copy into `extension/dist-e2e`, loads it unpacked
  into Chromium, signs up in a production build of the app, unlocks the popup and fills a local test
  login page. That test copy adds a host permission for the local test page (Playwright can't click
  the toolbar button to grant `activeTab`) and a fixed key for a known extension id.
