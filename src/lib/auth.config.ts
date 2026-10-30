import type { NextAuthConfig } from "next-auth";

// Edge-safe Auth.js config: no Prisma, no argon2, no Node-only imports.
//
// Used directly by the proxy (src/proxy.ts) to verify the session JWT's
// signature and expiry before any protected route renders. src/lib/auth.ts
// extends it with the database adapter, the Credentials provider and the
// tokenVersion revocation check, which need Node.js.

export const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;

export const authConfig = {
  // Auth.js v5 requires JWT strategy when using the Credentials provider.
  // Revocation works through User.tokenVersion (src/lib/session-version.ts).
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_S },

  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
    verifyRequest: "/auth/verify-email",
    newUser: "/auth/signup",
  },

  // Sign-in only happens through /api/auth (src/lib/auth.ts); the proxy never
  // authenticates anyone, it only verifies existing tokens.
  providers: [],

  callbacks: {
    // Edge: the JWT was already signature- and expiry-checked when decoded.
    // Pass it through unchanged (keeping tokenVersion/verCheckedAt); the
    // tokenVersion database check runs on the Node side in src/lib/auth.ts.
    jwt({ token }) {
      return token;
    },
    session({ session, token }) {
      // Expose user.id from the JWT so server components can read it
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
