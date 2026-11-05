import { AuthShell } from "@/components/shared/auth-shell";

// Visual shell for pre-vault screens (setup and unlock), shared with the auth pages.
export default function VaultGateLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
