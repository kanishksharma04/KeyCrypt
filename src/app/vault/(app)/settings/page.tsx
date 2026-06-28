import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getSessionsAction } from "@/server/settings-actions";
import { ChangeMasterPasswordForm } from "@/features/vault/change-master-password-form";
import { SessionList } from "@/features/vault/session-list";

export default async function SettingsPage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  const sessions = await getSessionsAction();

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
        <div className="bg-card rounded-xl border px-4 py-3">
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
        <div className="bg-card rounded-xl border p-4">
          <ChangeMasterPasswordForm />
        </div>
      </section>

      {/* Sessions */}
      <section aria-labelledby="sessions-heading">
        <h2 id="sessions-heading" className="mb-1 text-base font-semibold">
          Active sessions
        </h2>
        <p className="text-muted-foreground mb-4 text-sm">
          These are all devices currently signed into your account.
        </p>
        <SessionList sessions={sessions} />
      </section>
    </div>
  );
}
