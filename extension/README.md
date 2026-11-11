# KeyCrypt browser extension (MVP)

A Manifest V3 extension for Chrome, other Chromium browsers (Edge, Brave) and Firefox (128+). It unlocks your KeyCrypt vault
**locally** with your master password, stays unlocked for a while, fills saved logins and
authenticator codes on the site you're on, and can offer to save new logins.

It is a pnpm workspace package: the vault cryptography is the web app's own module
(`src/lib/crypto`, imported as `keycrypt/crypto`), not a copy.

## Build and load it unpacked

```bash
# from the repository root
pnpm install
KEYCRYPT_APP_URL=http://localhost:3000 pnpm ext:build   # your KeyCrypt URL; default http://localhost:3000
```

This builds `extension/dist/chrome` and `extension/dist/firefox`.

- **Chrome / Edge / Brave:** open `chrome://extensions`, turn on **Developer mode**, click **Load
  unpacked** and choose `extension/dist/chrome`. Pin KeyCrypt to the toolbar.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and
  choose `extension/dist/firefox/manifest.json`.

`KEYCRYPT_APP_URL` is baked into the build: its host becomes the extension's only required host
permission and the server the extension talks to. Rebuild (and reload the extension) if it changes.

## Store packages

```bash
KEYCRYPT_APP_URL=https://vault.example.com pnpm ext:package
```

builds both targets and writes `extension/packages/keycrypt-<version>-chrome.zip` (Chrome Web
Store, Edge Add-ons) and `keycrypt-<version>-firefox.zip` (addons.mozilla.org). It refuses a
non-https URL (`--allow-local` packages a localhost build for testing). The listing text, permission
justifications and privacy answers are in [STORE_LISTING.md](STORE_LISTING.md). Icons
(`public/icons`, 16/32/48/128 px) are made from the brand mark in the web app's `public/logos`.

## Firefox (Manifest V3) differences

- **Background:** Firefox runs `background.js` as an event page (`background.scripts`) instead of a
  service worker; Chromium uses `background.service_worker`. The code is the same: `src/browser.ts`
  picks Firefox's `browser` or Chromium's `chrome` namespace (both promise-based in MV3). Firefox
  may unload an idle event page too, which drops the key just like a stopped service worker.
- **Add-on id:** `browser_specific_settings.gecko.id` (`keycrypt-extension@keycrypt.app`, or
  `KEYCRYPT_GECKO_ID`), minimum version 128 (scripting, optional host permissions and module
  workers).
- **Host access is optional in Firefox:** users can withhold the app's host permission. The popup
  then shows **Allow access to KeyCrypt**.
- `data_collection_permissions` declares `authenticationInfo`: new logins are sent, encrypted, to
  your KeyCrypt server.
- The test-only manifest `key` (fixed extension id) is Chromium-only.

## Using it

1. Sign in to KeyCrypt in the same browser profile (the extension uses that session cookie).
2. On a login page, click the KeyCrypt toolbar icon and enter your **master password**. Choose how
   long it stays unlocked (1, 5, **10** (default), 30 or 60 minutes).
3. Logins saved for that site are listed; click one to fill the username and password. **Fill
   code** fills the current authenticator (TOTP) code, for logins with an authenticator key and for
   authenticator items whose issuer is the site's name (GitHub on github.com).
4. Opening the popup again within the unlock time needs no master password. **Lock** ends it early.
5. Optional: tick **Offer to save new logins** (asks for access to https sites). After you submit a
   sign-in or sign-up form, the toolbar icon shows **+**; open the popup and choose **Save login**.

## How it works

- `GET /api/ext/vault-meta` and `GET /api/ext/items?type=…` (in the web app) return your vault's
  salt, KDF parameters, wrapped vault key and item **ciphertext**, authenticated with your session
  cookie and scoped to your account. Items in Trash are never returned.
- **Unlocking** happens in the background service worker (`src/background.ts`): the popup hands it
  the master password, it derives the key-encryption key with Argon2id (WebAssembly), unwraps the
  vault key and keeps it as a non-extractable `CryptoKey` **in its memory** for the unlock time
  (`src/session.ts`). The key is dropped when the time is up (a 30-second `chrome.alarms` tick), on
  **Lock**, as soon as the KeyCrypt session cookie is removed (`chrome.cookies.onChanged`), if
  another account signs in, when the browser closes, and if the browser stops the worker early (then
  you simply unlock again). It is never written to `chrome.storage` (there's no `storage`
  permission); the only thing remembered between openings is the chosen unlock time, in the
  extension page's `localStorage`.
- A login matches when its URL's host is the tab's host, or the tab is on a subdomain of it
  (`example.com` matches `login.example.com`, never `evil-example.com`). Only `https://` pages are
  filled, plus `http://localhost` and `http://127.0.0.1`.
- Filling uses `chrome.scripting.executeScript` on the active tab (`activeTab` permission, granted
  by your click). The injected function refuses to fill if the page has moved to another host, and
  fills the password field plus the username field next to it, or the one-time-code field.
- **Saving** (opt-in): the content script `src/save.ts` runs on https pages only after you grant
  the optional `https://*/*` permission. On submit of a form with exactly one filled password field
  it sends the username and password to the background worker, which keeps them in memory for at
  most 5 minutes. **Save login** encrypts the item in the extension (a new item id, bound into the
  AAD) and sends only ciphertext to `POST /api/ext/items`. The server accepts logins only, checks
  the 5,000-item cap, records the event, and refuses requests from web pages (CSRF).

Permissions: `activeTab`, `scripting`, `alarms` (expire the unlocked key), `cookies` (drop the key
on sign-out; only the app's host is readable), host access to the KeyCrypt app's host, and the
**optional** `https://*/*` for "Offer to save new logins".

## Current limitations

- The Firefox build is tested by unit tests and its manifest, not by the end-to-end suite
  (Playwright can't load extensions into Firefox).
- The browser may stop the background worker before the unlock time is up; you then unlock again.
- Saving notices real form submissions only (not sign-ins done entirely by JavaScript without a
  `submit` event), doesn't update a changed password on an existing login, and saves the site's
  host as the item's name.
- Authenticator items have no URL: they're offered where the issuer equals the site's name, so a
  look-alike domain with the same name (github.net) would match too. Check the address bar.
- Top frame only (no logins inside iframes), and the first visible password or code field on the
  page.
- Site matching uses hosts, not the public suffix list, and has no per-login match rules.
- Vaults still on crypto v1 must be unlocked once in the web app (to upgrade) first.

## Tests

- Unit: `extension/src/*.test.ts` (run by `pnpm test` at the root).
- End to end: `pnpm test:extension` builds a test copy into `extension/dist-e2e`, loads it unpacked
  into Chromium, signs up in a production build of the app, unlocks the popup and fills a local test
  login page (`autofill.spec.ts`); then checks that the popup stays unlocked, that Lock and signing
  out of the web app drop the key, that a login's TOTP code fills, and that a submitted login is
  offered, saved and readable in the web app (`session-save-codes.spec.ts`). The test copy also
  registers the save script on the local test page, since Playwright can't answer the permission
  prompt. That test copy adds a host permission for the local test page (Playwright can't click
  the toolbar button to grant `activeTab`) and a fixed key for a known extension id.
