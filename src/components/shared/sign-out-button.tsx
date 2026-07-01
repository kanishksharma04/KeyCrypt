"use client";

import { signOut } from "next-auth/react";
import { buttonVariants } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <button
      onClick={() => void signOut({ callbackUrl: "/" })}
      className={buttonVariants({ variant: "ghost", size: "sm" })}
    >
      Sign out
    </button>
  );
}
