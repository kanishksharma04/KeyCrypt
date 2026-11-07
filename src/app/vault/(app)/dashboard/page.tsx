import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Activity, Download, LogIn, Shield, Trash2, Upload } from "lucide-react";
import { AuthenticatorIcon, FlatKeyIcon, PadlockIcon } from "@/components/shared/design-icons";
import { getVaultStatsAction } from "@/server/settings-actions";
import { getRecentActivityAction } from "@/server/activity-actions";
import { VaultHealthScore } from "@/features/vault/vault-health-score";
import { TYPE_META } from "@/features/vault/vault-item-types";
import { relativeTime } from "@/lib/relative-time";
import type { VaultItemType } from "@/types/vault";

const RECENT_ACTIVITY_COUNT = 5;

type ActivityIcon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

/** An icon for an audit action key ("auth.signin", "vault.item.create", …). */
function activityIcon(action: string): ActivityIcon {
  if (action.startsWith("auth.totp")) return AuthenticatorIcon;
  if (action.startsWith("auth.")) return LogIn;
  if (action === "vault.item.create") return PadlockIcon;
  if (action === "vault.item.delete") return Trash2;
  if (action === "vault.items.imported") return Upload;
  if (action === "vault.export") return Download;
  if (action.startsWith("vault.recovery")) return Shield;
  if (action.startsWith("vault.")) return FlatKeyIcon;
  return Activity;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card flex min-w-0 flex-col gap-1.5 rounded-[16px] border p-4 sm:p-[22px]">
      <p className="text-faint text-[12.5px]">{label}</p>
      <p className="truncate font-serif text-2xl leading-tight font-semibold tabular-nums sm:text-[28px]">
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
    <div className="mx-auto max-w-[1120px] px-4 pt-6 pb-12 sm:px-7 sm:pt-8 sm:pb-[60px]">
      <div className="mb-6 sm:mb-7">
        <h1 className="font-serif text-[26px] leading-tight font-[560]">Welcome back</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Here&apos;s how your vault is doing today.
        </p>
      </div>

      <div className="mb-5 sm:mb-6">
        <VaultHealthScore />
      </div>

      {stats && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:mb-6 sm:gap-5 lg:grid-cols-4">
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
            <section className="bg-card min-w-0 rounded-[16px] border p-5 sm:p-7">
              <h2 className="mb-[18px] text-sm font-semibold">Items by type</h2>
              <ul className="space-y-3.5">
                {types.map(([type, { plural, barColor }]) => {
                  const count = stats.byType[type];
                  const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
                  return (
                    <li key={type}>
                      <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                        <span>{plural}</span>
                        <span className="text-faint tabular-nums">{count}</span>
                      </div>
                      <div
                        className="bg-muted h-1.5 overflow-hidden rounded-full"
                        role="presentation"
                      >
                        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Recent activity */}
            <section className="bg-card min-w-0 rounded-[16px] border p-5 sm:p-7">
              <h2 className="mb-2 text-sm font-semibold">Recent activity</h2>
              {recent.length === 0 ? (
                <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
              ) : (
                <ul className="divide-y">
                  {recent.map((e) => {
                    const Icon = activityIcon(e.action);
                    return (
                      <li key={e.id} className="flex items-center gap-3 py-2.5">
                        <span
                          className="bg-muted flex size-[30px] shrink-0 items-center justify-center rounded-lg"
                          aria-hidden="true"
                        >
                          <Icon className="text-muted-foreground size-3.5" strokeWidth={1.6} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px]">
                            {e.label}
                            {e.browser && ` · ${e.browser}`}
                          </p>
                          <time
                            dateTime={e.createdAt}
                            title={new Date(e.createdAt).toLocaleString()}
                            className="text-faint text-xs"
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
