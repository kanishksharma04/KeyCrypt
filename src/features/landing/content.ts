// Copy for the landing page sections.

export const MARGIN_NOTES = [
  "Encrypted in your browser with AES-256-GCM before anything is uploaded.",
  "Your master password never touches the network. Not once, not hashed.",
  "Open source and MIT-licensed. Self-host it, or read every line.",
];

export const STEPS = [
  {
    title: "Master password",
    body: "You type it once. It lives in this tab's memory and is never sent anywhere.",
    spec: "memory only",
  },
  {
    title: "Argon2id",
    body: "Stretches it into a key-encryption key, slowly on purpose, in a Web Worker.",
    spec: "64 MiB · t=3 · p=1",
  },
  {
    title: "Vault key",
    body: "A random 256-bit key, never derived from a password, stored only wrapped by the step above.",
    spec: "AES-256 · non-extractable",
  },
  {
    title: "AES-256-GCM",
    body: "Every item is sealed with a fresh IV and bound to its own row, so a ciphertext can't be moved.",
    spec: "96-bit IV · AAD",
  },
  {
    title: "Ciphertext",
    body: "The only thing that reaches our server. Without your master password, it is noise.",
    spec: "base64 · stored",
  },
];

// Fig. 1: a VaultItem row as the database holds it (illustrative values).
export const RECORD: Array<{ key: string; value: string; note?: string; secret?: boolean }> = [
  { key: "id", value: '"6f1c2a4e-8b3d-4f5a-9c7e-1d2b3a4c5e6f"' },
  { key: "type", value: "LOGIN", note: "plain text" },
  { key: "favorite", value: "false", note: "plain text" },
  { key: "folderId", value: "null", note: "plain text" },
  { key: "name", value: "null", note: "sealed in the ciphertext" },
  {
    key: "ciphertext",
    value: '"q8Hc0Zl3vT9mXwKp4sJd…E1aYwR2xN9=="',
    note: "name · login · password · notes",
    secret: true,
  },
  { key: "iv", value: '"Jf2kQ9xVb1sM0aTe"', secret: true },
  { key: "updatedAt", value: "2026-11-07T13:40:00Z", note: "plain text" },
];

// "What the server can see today". Keep in sync with CLAUDE.md "Security model",
// README's security table and docs/threat-model.md.
export const SERVER_SEES = [
  "Your account email, for signing in",
  'Each item\'s type — "this is a login", not what it is',
  "Favourites, folders as structure, and timestamps",
];

export const SERVER_NEVER_SEES = [
  "Item names, usernames, passwords and notes",
  "Folder names, API keys, TOTP secrets",
  "Your master password — it never leaves the browser",
];

export const CONTENTS = [
  {
    title: "Logins",
    short: "generator · strength · breach check",
    body: "Usernames and passwords with a built-in generator, a live strength meter and Have I Been Pwned checks done with k-anonymity, never your full password.",
  },
  {
    title: "Secure notes",
    short: "free-form, encrypted",
    body: "Licence keys, PINs, passphrases, private notes: anything that doesn't fit a password field.",
  },
  {
    title: "API keys",
    short: "monospace · one-tap copy",
    body: "Service tokens and secrets in a field built for long, awkward strings.",
  },
  {
    title: "Wi-Fi passwords",
    short: "SSID · password · security",
    body: "Handy for guests, and for remembering your own network.",
  },
  {
    title: "Authenticator codes",
    short: "live TOTP, 6–8 digits",
    body: "TOTP secrets next to the login they belong to, with a countdown ring.",
  },
  {
    title: "Folders & ⌘K",
    short: "encrypted names · fuzzy search",
    body: "Encrypted folder names, and a command palette that finds any item, folder or action.",
  },
];
