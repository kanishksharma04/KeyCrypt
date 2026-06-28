import { redirect } from "next/navigation";

// Dashboard moved to /vault/dashboard in Phase 8
export default function DashboardRedirect() {
  redirect("/vault/dashboard");
}
