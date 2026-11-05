import { AuthShell } from "@/components/shared/auth-shell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthShell footer="End-to-end encrypted. Your master password never reaches our servers.">
      {children}
    </AuthShell>
  );
}
