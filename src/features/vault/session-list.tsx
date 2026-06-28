"use client";

import { useTransition } from "react";
import { Monitor, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { signOut } from "next-auth/react";
import { revokeOtherSessionsAction, revokeAllSessionsAction } from "@/server/settings-actions";
import { Button } from "@/components/ui/button";
import type { SessionInfo } from "@/server/settings-actions";

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface SessionListProps {
  sessions: SessionInfo[];
}

export function SessionList({ sessions }: SessionListProps) {
  const [isPendingOthers, startOthers] = useTransition();
  const [isPendingAll, startAll] = useTransition();

  const otherCount = sessions.filter((s) => !s.isCurrent).length;

  function handleRevokeOthers() {
    startOthers(async () => {
      const result = await revokeOtherSessionsAction();
      if (result.error) toast.error(result.error);
      else toast.success("Other sessions signed out.");
    });
  }

  function handleSignOutAll() {
    startAll(async () => {
      await revokeAllSessionsAction();
      await signOut({ callbackUrl: "/auth/signin" });
    });
  }

  return (
    <div className="space-y-4">
      <div className="divide-y rounded-xl border">
        {sessions.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">
            No active sessions found.
          </p>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <Monitor className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {s.isCurrent ? "This device" : "Other device"}
                  {s.isCurrent && (
                    <span className="bg-primary/10 text-primary ml-2 rounded-full px-2 py-0.5 text-xs font-normal">
                      Current
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground text-xs">Expires {formatExpiry(s.expires)}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {otherCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRevokeOthers}
            disabled={isPendingOthers || isPendingAll}
          >
            {isPendingOthers && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            Sign out {otherCount} other {otherCount === 1 ? "device" : "devices"}
          </Button>
        )}
        <Button
          variant="destructive"
          size="sm"
          onClick={handleSignOutAll}
          disabled={isPendingOthers || isPendingAll}
        >
          {isPendingAll && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          Sign out everywhere
        </Button>
      </div>
    </div>
  );
}
