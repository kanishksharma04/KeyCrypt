import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Code2, FileText, KeyRound, Star, Vault, Wifi } from "lucide-react";
import { getVaultStatsAction } from "@/server/settings-actions";

const TYPE_META = {
  LOGIN: { label: "Logins", Icon: KeyRound, color: "text-primary", bg: "bg-primary/10" },
  SECURE_NOTE: {
    label: "Secure Notes",
    Icon: FileText,
    color: "text-green-500",
    bg: "bg-green-500/10",
  },
  API_KEY: { label: "API Keys", Icon: Code2, color: "text-purple-500", bg: "bg-purple-500/10" },
  WIFI_PASSWORD: {
    label: "WiFi Passwords",
    Icon: Wifi,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
  },
} as const;

function StatCard({
  label,
  value,
  Icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-card flex items-center gap-4 rounded-xl border p-4">
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${bg}`}>
        <Icon className={`size-5 ${color}`} aria-hidden="true" />
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-muted-foreground text-sm">{label}</p>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  const stats = await getVaultStatsAction();

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {session.user.name ?? session.user.email?.split("@")[0]}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {stats
            ? `${stats.total} item${stats.total !== 1 ? "s" : ""} in your vault${stats.lastModified ? ` · Last updated ${new Date(stats.lastModified).toLocaleDateString()}` : ""}`
            : "Your encrypted vault is ready."}
        </p>
      </div>

      {/* Overview cards */}
      {stats && (
        <div className="space-y-6">
          {/* Total + favorites */}
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Total items"
              value={stats.total}
              Icon={Vault}
              color="text-foreground"
              bg="bg-muted"
            />
            <StatCard
              label="Favorites"
              value={stats.favorites}
              Icon={Star}
              color="text-amber-500"
              bg="bg-amber-500/10"
            />
          </div>

          {/* By type */}
          <div>
            <h2 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wider uppercase">
              By type
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                Object.entries(TYPE_META) as [
                  keyof typeof TYPE_META,
                  (typeof TYPE_META)[keyof typeof TYPE_META],
                ][]
              ).map(([type, { label, Icon, color, bg }]) => (
                <StatCard
                  key={type}
                  label={label}
                  value={stats.byType[type]}
                  Icon={Icon}
                  color={color}
                  bg={bg}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
