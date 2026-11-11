// The WebExtension API: Firefox's promise-based `browser`, or Chromium's
// `chrome` (also promise-based in Manifest V3). The calls this extension makes
// have the same shape in both, so one typed handle is enough.

export const ext: typeof chrome =
  (globalThis as { browser?: typeof chrome }).browser ?? globalThis.chrome;
