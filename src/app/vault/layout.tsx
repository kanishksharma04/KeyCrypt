import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

// Full DB session validation for all /vault/* routes.
// The proxy cookie check (src/proxy.ts) handles unauthenticated navigation early;
// this is the authoritative server-side check.
export default async function VaultLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  return <>{children}</>;
}
