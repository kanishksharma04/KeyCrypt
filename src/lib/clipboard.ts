// Copying secrets to the clipboard, with automatic clearing.
//
// Every copy of a secret goes through copySecret(). After `clearAfterMs` the
// clipboard is cleared, unless it now holds something else the user copied.

export const CLIPBOARD_CLEAR_MS = 30_000;
export const COPIED_TOAST = "Copied. Clipboard clears in 30 seconds.";

// One pending clear at a time: a newer copy replaces the older one's timer, so
// an earlier secret's timer can never clear a later copy early.
let pendingClear: ReturnType<typeof setTimeout> | null = null;

export async function copySecret(
  text: string,
  { clearAfterMs = CLIPBOARD_CLEAR_MS }: { clearAfterMs?: number } = {}
): Promise<void> {
  // Rejects if the browser refuses the write; callers show an error.
  await navigator.clipboard.writeText(text);

  if (pendingClear) clearTimeout(pendingClear);
  pendingClear = setTimeout(() => {
    pendingClear = null;
    void clearIfUnchanged(text);
  }, clearAfterMs);
}

async function clearIfUnchanged(copied: string): Promise<void> {
  try {
    // Leave the clipboard alone if the user has since copied something else.
    if ((await navigator.clipboard.readText()) !== copied) return;
  } catch {
    // Reading is often refused (permission prompt, unfocused page): clear anyway.
  }
  try {
    await navigator.clipboard.writeText("");
  } catch {
    // Writing can fail if the page is not focused; nothing more we can do.
  }
}
