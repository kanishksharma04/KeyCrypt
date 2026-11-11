import type { Metadata } from "next";
import { SignInForm } from "@/features/auth/sign-in-form";
import { ClearOfflineVault } from "@/features/vault/clear-offline-vault";

export const metadata: Metadata = { title: "Sign In" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { deleted } = await searchParams;
  return (
    <>
      <SignInForm
        notice={deleted === "1" ? "Your account and vault were permanently deleted." : undefined}
      />
      <ClearOfflineVault />
    </>
  );
}
