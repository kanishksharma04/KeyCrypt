// Route access rules applied by the proxy (src/proxy.ts). Pure, so they can be
// unit-tested without Auth.js.

/** Need a session; signed-out visitors are sent to sign in. */
export const PROTECTED_PREFIXES = ["/vault"];

/** Only for signed-out visitors; signed-in users are sent to their vault. */
export const AUTH_ONLY_PREFIXES = ["/auth/signin", "/auth/signup"];

/**
 * Pages anyone can read, signed in or not. Not consulted by the proxy (every
 * route outside the lists above is public); listed so tests can check they
 * stay public.
 */
export const PUBLIC_PAGES = ["/", "/privacy", "/terms"];

export type RouteAccess = "protected" | "auth-only" | "public";

export function routeAccess(pathname: string): RouteAccess {
  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) return "protected";
  if (AUTH_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) return "auth-only";
  return "public";
}
