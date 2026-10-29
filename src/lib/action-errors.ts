// Error messages that server actions return and client code matches on.
// Kept in a dependency-free module so client components can import them
// ("use server" files may only export async functions).

/** A destructive action needs a fresh account-password confirmation (src/lib/reauth.ts). */
export const REAUTH_REQUIRED_ERROR = "Please confirm your account password to continue.";

/** The vault's items or verifier changed while a master-password change was in flight. */
export const VAULT_CHANGED_ERROR = "Your vault changed during the update. Please try again.";
