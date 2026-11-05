// Pure; no I/O.
//
// Short (default): "just now", "5m ago", "3h ago", "2d ago"; past 30 days a date,
// or with `longAgo: "ago"` "4mo ago" / "2y ago".
// Long (`style: "long"`): "just now", "5 minutes ago", "1 hour ago", "Yesterday",
// "3 days ago", "2 weeks ago", "4 months ago", "2 years ago".

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

export function relativeTime(
  iso: string,
  {
    now = Date.now(),
    longAgo = "date",
    style = "short",
  }: { now?: number; longAgo?: "date" | "ago"; style?: "short" | "long" } = {}
): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  if (style === "long") {
    if (m < 1) return "just now";
    if (m < 60) return plural(m, "minute");
    if (h < 24) return plural(h, "hour");
    if (d === 1) return "Yesterday";
    if (d < 7) return plural(d, "day");
    if (d < 30) return plural(Math.floor(d / 7), "week");
    if (longAgo === "date") return new Date(iso).toLocaleDateString();
    const mo = Math.floor(d / 30);
    return mo < 12 ? plural(mo, "month") : plural(Math.floor(mo / 12), "year");
  }

  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 30) return `${d}d ago`;
  if (longAgo === "date") return new Date(iso).toLocaleDateString();
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
