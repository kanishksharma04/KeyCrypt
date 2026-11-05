// "just now", "5m ago", "3h ago", "2d ago". Past 30 days: a date (default), or
// with `longAgo: "ago"` "4mo ago" / "2y ago" (vault cards). Pure; no I/O.

export function relativeTime(
  iso: string,
  { now = Date.now(), longAgo = "date" }: { now?: number; longAgo?: "date" | "ago" } = {}
): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  if (longAgo === "date") return new Date(iso).toLocaleDateString();
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
