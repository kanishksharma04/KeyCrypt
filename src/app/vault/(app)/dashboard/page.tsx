import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  Activity,
  Download,
  Key,
  Lock,
  LogIn,
  Shield,
  Smartphone,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { getVaultStatsAction } from "@/server/settings-actions";
import { getRecentActivityAction } from "@/server/activity-actions";
import { VaultHealthScore } from "@/features/vault/vault-health-score";
import { TYPE_META } from "@/features/vault/vault-item-types";
import { relativeTime } from "@/lib/relative-time";
import type { VaultItemType } from "@/types/vault";

const RECENT_ACTIVITY_COUNT = 5;

/** An icon for an audit action key ("auth.signin", "vault.item.create", …). */
function activityIcon(action: string): { Icon: LucideIcon; rotate?: boolean } {
  if (action.startsWith("auth.totp")) return { Icon: Smartphone };
  if (action.startsWith("auth.")) return { Icon: LogIn };
  if (action === "vault.item.create") return { Icon: Lock };
  if (action === "vault.item.delete") return { Icon: Trash2 };
  if (action === "vault.items.imported") return { Icon: Upload };
  if (action === "vault.export") return { Icon: Download };
  if (action.startsWith("vault.recovery")) return { Icon: Shield };
  // Lucide's key is diagonal; turned 45° it lies flat, as in the design.
  if (action.startsWith("vault.")) return { Icon: Key, rotate: true };
  return { Icon: Activity };
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card min-w-0 rounded-2xl border px-4 py-4 sm:px-5 sm:py-5">
      <p className="text-muted-foreground text-[13px]">{label}</p>
      <p className="mt-1 truncate font-serif text-2xl font-semibold tabular-nums sm:text-[1.75rem]">
        {value}
      </p>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  const [stats, activity] = await Promise.all([getVaultStatsAction(), getRecentActivityAction()]);
  const recent = Array.isArray(activity) ? activity.slice(0, RECENT_ACTIVITY_COUNT) : [];
  const types = Object.entries(TYPE_META) as [VaultItemType, (typeof TYPE_META)[VaultItemType]][];

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6 sm:py-10">
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground mt-1 text-[15px]">
          Here&apos;s how your vault is doing today.
        </p>
      </div>

      <VaultHealthScore />

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">
            <StatCard label="Total items" value={stats.total} />
            <StatCard label="Folders" value={stats.folders} />
            <StatCard label="Favourites" value={stats.favorites} />
            <StatCard
              label="Last updated"
              value={
                stats.lastModified ? relativeTime(stats.lastModified, { longAgo: "ago" }) : "—"
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* Items by type */}
            <section className="bg-card min-w-0 rounded-2xl border p-5 sm:p-6">
              <h2 className="mb-4 text-[15px] font-semibold">Items by type</h2>
              <ul className="space-y-3.5">
                {types.map(([type, { plural, barColor }]) => {
                  const count = stats.byType[type];
                  const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
                  return (
                    <li key={type}>
                      <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                        <span>{plural}</span>
                        <span className="text-muted-foreground tabular-nums">{count}</span>
                      </div>
                      <div
                        className="bg-muted h-1.5 overflow-hidden rounded-full"
                        role="presentation"
                      >
                        <div
                          className={`h-full rounded-full ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Recent activity */}
            <section className="bg-card min-w-0 rounded-2xl border p-5 sm:p-6">
              <h2 className="mb-2 text-[15px] font-semibold">Recent activity</h2>
              {recent.length === 0 ? (
                <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
              ) : (
                <ul className="divide-y">
                  {recent.map((e) => {
                    const { Icon, rotate } = activityIcon(e.action);
                    return (
                      <li key={e.id} className="flex items-center gap-3 py-2.5">
                        <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg border dark:border-white/5">
                          <Icon
                            className={`text-muted-foreground size-3.5 ${rotate ? "rotate-45" : ""}`}
                            aria-hidden="true"
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm">
                            {e.label}
                            {e.browser && ` · ${e.browser}`}
                          </p>
                          <time
                            dateTime={e.createdAt}
                            title={new Date(e.createdAt).toLocaleString()}
                            className="text-muted-foreground text-xs"
                          >
                            {relativeTime(e.createdAt, { style: "long" })}
                          </time>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
