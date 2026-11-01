"use client";

import { createContext, useContext } from "react";

// The signed-in user's id, for client code that must bind item ciphertext to
// its owner (crypto v2 AAD: "kc:v2|userId|itemId|type"). Provided by the vault
// layout from the server session.

const VaultUserCtx = createContext<string | null>(null);

export function VaultUserProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  return <VaultUserCtx.Provider value={userId}>{children}</VaultUserCtx.Provider>;
}

export function useVaultUserId(): string {
  const userId = useContext(VaultUserCtx);
  if (!userId) throw new Error("useVaultUserId must be used within VaultUserProvider");
  return userId;
}
