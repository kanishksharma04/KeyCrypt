import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

// Full DB session validation for all /vault/* routes.
// The middleware cookie check handles unauthenticated navigation at the edge;
// this is the authoritative server-side check.
export default async function VaultLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  return <>{children}</>;
}
