# Store listing: KeyCrypt extension

Text and answers for the Chrome Web Store, Microsoft Edge Add-ons and addons.mozilla.org (AMO).
Build the packages with `KEYCRYPT_APP_URL=https://<your instance> pnpm ext:package`; upload
`extension/packages/keycrypt-<version>-chrome.zip` to Chrome and Edge, and
`keycrypt-<version>-firefox.zip` to AMO.

## Name

KeyCrypt

## Short description (132 characters max)

Fill logins and authenticator codes from your KeyCrypt vault. Unlocked and decrypted locally;
the server only sees ciphertext.

## Description

KeyCrypt is a zero-knowledge password manager. This extension connects to your KeyCrypt account
and fills your saved logins on the site you're on.

- **Unlock locally.** Your master password never leaves your browser. The extension derives your
  vault key on your device (Argon2id) and decrypts your logins there. The KeyCrypt server only ever
  stores and sends ciphertext.
- **Stays unlocked for a while.** Choose 1, 5, 10, 30 or 60 minutes. The key is kept in memory
  only and dropped on timeout, when you click Lock, when you sign out of KeyCrypt, or when the
  browser closes.
- **Fill logins and codes.** One click fills the username and password, or the current
  authenticator (TOTP) code, for the site you're on. Logins are only offered on the site (or its
  subdomains) they were saved for, and only on https:// pages.
- **Save new logins (optional).** Turn on "Offer to save new logins" and, after you sign in or sign
  up somewhere, the extension offers to save the login to your vault, encrypted on your device.

The extension works with a KeyCrypt instance you or your organisation runs. KeyCrypt is open
source (MIT): https://github.com/kanishksharma04/KeyCrypt

## Category

Productivity (Chrome) / Privacy & Security (Firefox)

## Single purpose (Chrome)

Fill and save logins and authenticator codes from the user's KeyCrypt password vault, decrypting
them locally.

## Permission justifications

| Permission                                                                | Why it's needed                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                                                               | To fill a login or code into the page the user is on, only after they click the toolbar button. No access to any other tab.                                                                                                     |
| `scripting`                                                               | To inject the small fill function into that active tab, and to register the optional save-login content script once the user turns the feature on.                                                                              |
| `alarms`                                                                  | To drop the unlocked vault key when the user's chosen unlock time runs out (a 30-second check).                                                                                                                                 |
| `cookies`                                                                 | To notice when the user signs out of KeyCrypt (the session cookie is removed) and drop the vault key at once. Only cookies of the KeyCrypt app's host are visible, because that is the only required host permission.           |
| Host permission for the KeyCrypt app (e.g. `https://vault.example.com/*`) | To fetch the user's encrypted vault and save new logins (as ciphertext) through the KeyCrypt API, using the user's existing session.                                                                                            |
| Optional `https://*/*`                                                    | Requested only if the user turns on "Offer to save new logins". Lets a small content script notice when a login form is submitted, so the extension can offer to save it. Off by default; can be turned off again in the popup. |

Remote code: none. All code ships in the package; no `eval`. WebAssembly (Argon2id) is allowed
through `'wasm-unsafe-eval'` in the extension's CSP.

## Privacy

- **Privacy policy:** `https://<your instance>/privacy` (the KeyCrypt instance's `/privacy` page).
- The master password, vault key and decrypted data never leave the user's browser. The extension
  sends the KeyCrypt server only ciphertext (vault items it reads, and new logins it saves,
  encrypted on the device), authenticated with the user's existing KeyCrypt session.
- With "Offer to save new logins" on, a submitted username and password are kept in the
  extension's memory for up to 5 minutes until the user saves or dismisses them, and are never
  sent anywhere unencrypted.
- No analytics, no ads, no third-party services, no data sold or shared.

Chrome Web Store data-use disclosures: the extension handles **authentication information**
(logins the user saves), only to provide its single purpose, transmitted to the user's own KeyCrypt
server encrypted; it doesn't sell, share or use it for anything else.

Firefox: `browser_specific_settings.gecko.data_collection_permissions` declares
`authenticationInfo` (new logins are sent, encrypted, to the user's KeyCrypt server).

## Firefox (AMO) notes

- **Add-on id:** `keycrypt-extension@keycrypt.app` by default; set `KEYCRYPT_GECKO_ID` before
  packaging to use your own. It can't change once published.
- **Source code:** the package contains bundled, minified code, so AMO asks for the source. Upload
  the repository at the released tag (or `git archive`), with these build steps: Node 22, pnpm 11,
  `pnpm install --frozen-lockfile`, then `KEYCRYPT_APP_URL=<same URL> pnpm ext:package`.
- **Host access:** Firefox lets users withhold the app's host permission; the popup then shows
  "Allow access to KeyCrypt".

## Screenshots to prepare

1. The popup listing logins for a site.
2. The unlock screen with the "Stay unlocked for" choice.
3. "Save login for example.com?" after signing in.
