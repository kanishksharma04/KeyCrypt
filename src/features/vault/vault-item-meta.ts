import { toast } from "sonner";
import { copySecret, COPIED_TOAST } from "@/lib/clipboard";

// Shared by the vault list, its rows and the view dialog.

export { TYPE_META } from "./vault-item-types";

// ─── Clipboard helper ─────────────────────────────────────────────────────────

/** Copy a secret; the clipboard clears after 30 s (src/lib/clipboard.ts). */
export async function copyToClipboard(text: string) {
  try {
    await copySecret(text);
    toast.success(COPIED_TOAST);
  } catch {
    toast.error("Failed to copy to clipboard");
  }
}
