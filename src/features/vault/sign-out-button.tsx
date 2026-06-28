"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    await signOut({ callbackUrl: "/auth/signin" });
  }

  return (
    <Button variant="destructive" onClick={handleSignOut} disabled={loading}>
      {loading ? (
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
      ) : (
        <LogOut className="mr-2 size-4" aria-hidden="true" />
      )}
      {loading ? "Signing out…" : "Sign out of this device"}
    </Button>
  );
}
