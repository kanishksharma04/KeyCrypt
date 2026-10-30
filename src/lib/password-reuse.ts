// Browser-only check that the master password differs from the account password.
//
// The account (sign-in) password is sent to the server at every sign-in. If the
// master password were the same, the server would have seen the key to the
// vault, breaking the zero-knowledge promise. The comparison happens in the
// browser; the master password is never sent anywhere for it.

export const PASSWORD_REUSE_ERROR = "Use a different password from your account password.";

/**
 * True if the two passwords are the same. Unicode-normalised (NFC) so that
 * visually identical input from different keyboards/IMEs still matches.
 * Whitespace and case are significant, exactly as in sign-in.
 */
export function isSameAsAccountPassword(masterPassword: string, accountPassword: string): boolean {
  return masterPassword.normalize("NFC") === accountPassword.normalize("NFC");
}
