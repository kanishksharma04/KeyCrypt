"use client";

import { relativeTime } from "@/lib/activity";
import type { ActivityEntry } from "@/server/activity-actions";

/** Settings → Recent activity: what happened on this account, where and from which browser. */
export function RecentActivity({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">No activity recorded yet.</p>;
  }

  return (
    <ul className="divide-y text-sm" aria-label="Recent activity">
      {entries.map((e) => (
        <li
          key={e.id}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2"
        >
          <span className="font-medium">{e.label}</span>
          <span className="text-muted-foreground text-xs">
            <time
              dateTime={e.createdAt}
              title={new Date(e.createdAt).toLocaleString()}
              suppressHydrationWarning
            >
              {relativeTime(e.createdAt)}
            </time>
            {e.browser && <> · {e.browser}</>}
            {e.ip && <> · {e.ip}</>}
          </span>
        </li>
      ))}
    </ul>
  );
}
