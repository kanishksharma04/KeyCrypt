"use client";

import { useState } from "react";
import { Copy, Download, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copySecret, COPIED_TOAST } from "@/lib/clipboard";
import { downloadFile } from "@/lib/download";

interface RecoveryKitDisplayProps {
  /** The recovery key text (XXXX-XXXX-…). Shown once; never stored by the app. */
  recoveryKey: string;
  onDone: () => void;
  doneLabel?: string;
}

function recoveryFileContent(recoveryKey: string): string {
  return [
    "KeyCrypt recovery key",
    "=====================",
    "",
    recoveryKey,
    "",
    `Created: ${new Date().toISOString().slice(0, 10)}`,
    "",
    'If you forget your master password, choose "Use recovery key" on the unlock',
    "screen and enter this key to set a new master password.",
    "",
    "Anyone with this key and access to your account can open your vault.",
    "Keep it offline and private, and delete any copies you no longer need.",
    "",
  ].join("\n");
}

/** Shows a freshly generated recovery key once, with copy, download and a confirmation. */
export function RecoveryKitDisplay({
  recoveryKey,
  onDone,
  doneLabel = "Continue",
}: RecoveryKitDisplayProps) {
  const [saved, setSaved] = useState(false);

  async function copy() {
    try {
      await copySecret(recoveryKey); // clears after 30 s
      toast.success(COPIED_TOAST);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }

  function download() {
    downloadFile("keycrypt-recovery-key.txt", recoveryFileContent(recoveryKey), "text/plain");
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <KeyRound className="text-primary size-5" aria-hidden="true" />
          Save your recovery key
        </h2>
        <p className="text-muted-foreground text-sm">
          If you forget your master password, this key is the only way back into your vault. It is
          shown <strong>only once</strong>. Keep it somewhere safe and offline.
        </p>
      </div>

      <p
        className="bg-muted rounded-lg border px-3 py-3 text-center font-mono text-base font-semibold tracking-wider break-all select-all"
        aria-label="Recovery key"
        data-testid="recovery-key"
      >
        {recoveryKey}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          <Copy className="size-3.5" aria-hidden="true" />
          Copy
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Download className="size-3.5" aria-hidden="true" />
          Download .txt
        </Button>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        <span>I have saved my recovery key somewhere safe.</span>
      </label>

      <Button type="button" className="w-full" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}
