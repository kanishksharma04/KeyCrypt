import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { ChangeMasterPasswordForm } from "@/features/vault/change-master-password-form";
import { SignOutAllDevicesButton } from "@/features/vault/sign-out-all-devices-button";
import { ExportVault } from "@/features/vault/export-vault";

export default async function SettingsPage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-8 text-2xl font-bold tracking-tight">Settings</h1>

      {/* Account info */}
      <section aria-labelledby="account-heading" className="mb-10">
        <h2 id="account-heading" className="mb-1 text-base font-semibold">
          Account
        </h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Signed in as <strong>{session.user.email}</strong>
          {session.user.name ? ` (${session.user.name})` : ""}
        </p>
        <div className="bg-card rounded-xl border px-4 py-3 shadow-xs">
          <p className="text-muted-foreground text-sm">
            Account management (email change, avatar) coming in a future update.
          </p>
        </div>
      </section>

      {/* Change master password */}
      <section aria-labelledby="cmp-heading" className="mb-10">
        <h2 id="cmp-heading" className="mb-1 text-base font-semibold">
          Master password
        </h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Changing your master password re-encrypts every vault item in the browser. The server
          never sees your passwords.
        </p>
        <div className="bg-card rounded-xl border p-4 shadow-xs">
          <ChangeMasterPasswordForm />
        </div>
      </section>

      {/* Export */}
      <section aria-labelledby="export-heading" className="mb-10">
        <h2 id="export-heading" className="mb-1 text-base font-semibold">
          Export
        </h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Download a copy of your vault. The file is built in this browser; nothing decrypted is
          sent to the server.
        </p>
        <div className="bg-card rounded-xl border p-4 shadow-xs">
          <ExportVault />
        </div>
      </section>

      {/* Sign out */}
      <section aria-labelledby="signout-heading">
        <h2 id="signout-heading" className="mb-1 text-base font-semibold">
          Sign out
        </h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Sign out of this browser, or end every session on every device (for example after using a
          shared computer or losing a device).
        </p>
        <div className="bg-card flex flex-wrap gap-3 rounded-xl border p-4 shadow-xs">
          <SignOutButton
            display="icon-label"
            variant="destructive"
            label="Sign out of this device"
          />
          <SignOutAllDevicesButton />
        </div>
      </section>
    </div>
  );
}
