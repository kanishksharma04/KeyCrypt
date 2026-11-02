import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { authConfig } from "@/lib/auth.config";
import { authorizeCredentials } from "@/lib/authorize-credentials";
import { checkTokenVersion } from "@/lib/session-version";

// Full (Node.js) Auth.js config: extends the edge-safe src/lib/auth.config.ts
// with the Prisma adapter, the Credentials provider and the tokenVersion check.

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),

  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // Rate limiting, timing equalisation and the email-verified check all
      // live in authorizeCredentials (src/lib/authorize-credentials.ts).
      authorize: (credentials, request) => authorizeCredentials(credentials, request),
    }),
  ],

  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      // Initial sign-in: user comes from authorize(). Stamp the token with the
      // user's current tokenVersion.
      if (user?.id) {
        token.sub = user.id;
        token.tokenVersion = user.tokenVersion ?? 0;
        token.verCheckedAt = Date.now();
        return token;
      }
      // Every later request: end the session if it has been revoked.
      return checkTokenVersion(token);
    },
  },

  events: {
    async signIn({ user, isNewUser }) {
      if (!user.id) return;
      await logAudit(user.id, isNewUser ? "auth.signup.oauth" : "auth.signin");
    },
  },
});
