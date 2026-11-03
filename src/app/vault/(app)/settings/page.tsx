import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { ChangeMasterPasswordForm } from "@/features/vault/change-master-password-form";
import { SignOutAllDevicesButton } from "@/features/vault/sign-out-all-devices-button";
import { ExportVault } from "@/features/vault/export-vault";
import { RecoveryKitSettings } from "@/features/vault/recovery-kit-settings";
import { db } from "@/lib/db";
import { getRecentActivityAction } from "@/server/activity-actions";
import { RecentActivity } from "@/features/vault/recent-activity";
import { getTwoFactorStatusAction } from "@/server/two-factor-actions";
import { TwoFactorSettings } from "@/features/vault/two-factor-settings";
import { DeleteAccount } from "@/features/vault/delete-account";
import { ImportVault } from "@/features/vault/import-vault";

export default async function SettingsPage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  const activity = await getRecentActivityAction();
  const twoFactor = await getTwoFactorStatusAction();
  const vaultMeta = await db.vaultMeta.findUnique({
    where: { userId: session.user.id },
    select: { recoveryCreatedAt: true },
  });

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
          Changing your master password re-wraps your vault key in the browser; your items are not
          touched. The server never sees your passwords.
        </p>
        <div className="bg-card rounded-xl border p-4 shadow-xs">
          <ChangeMasterPasswordForm />
        </div>
      </section>

      {/* Two-factor sign-in */}
      <section aria-labelledby="two-factor-heading" className="mb-10">
        <h2 id="two-factor-heading" className="mb-1 text-base font-semibold">
          Two-factor sign-in
        </h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Ask for a code from your authenticator app whenever you sign in. This protects your
          account; your vault stays encrypted with your master password either way.
        </p>
        <div className="bg-card rounded-xl border p-4 shadow-xs">
          <TwoFactorSettings
            {...("error" in twoFactor
              ? { enabled: false, backupCodesLeft: 0, available: false }
              : twoFactor)}
          />
        </div>
      </section>

      {/* Recovery kit */}
      <section aria-labelledby="recovery-heading" className="mb-10">
        <h2 id="recovery-heading" className="mb-1 text-base font-semibold">
          Recovery kit
        </h2>
        <p className="text-muted-foreground mb-4 text-sm">
          A recovery key lets you unlock your vault and set a new master password if you forget it.
          Store it offline; anyone with it and access to your account can open your vault.
        </p>
        <div className="bg-card rounded-xl border p-4 shadow-xs">
          <RecoveryKitSettings
            recoveryCreatedAt={vaultMeta?.recoveryCreatedAt?.toISOString() ?? null}
          />
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

      {/* Import */}
      <section aria-labelledby="import-heading" className="mb-10">
        <h2 id="import-heading" className="mb-1 text-base font-semibold">
          Import
        </h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Bring your passwords over from another password manager or browser.
        </p>
        <div className="bg-card rounded-xl border p-4 shadow-xs">
          <ImportVault />
        </div>
      </section>

      {/* Recent activity */}
      <section aria-labelledby="activity-heading" className="mb-10">
        <h2 id="activity-heading" className="mb-1 text-base font-semibold">
          Recent activity
        </h2>
        <p className="text-muted-foreground mb-4 text-sm">
          The last 50 security events on your account, with the IP address and browser they came
          from. Entries are kept for 180 days.
        </p>
        <div className="bg-card rounded-xl border px-4 py-2 shadow-xs">
          <RecentActivity entries={"error" in activity ? [] : activity} />
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

      {/* Danger zone */}
      <section aria-labelledby="delete-account-heading" className="mt-10">
        <h2 id="delete-account-heading" className="text-destructive mb-1 text-base font-semibold">
          Danger zone
        </h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Delete your account and everything stored with it.
        </p>
        <div className="border-destructive/40 bg-card rounded-xl border p-4 shadow-xs">
          <DeleteAccount email={session.user.email ?? ""} />
        </div>
      </section>
    </div>
  );
}
