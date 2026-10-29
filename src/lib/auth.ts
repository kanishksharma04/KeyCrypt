import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { authorizeCredentials } from "@/lib/authorize-credentials";
import { checkTokenVersion } from "@/lib/session-version";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  // Auth.js v5 requires JWT strategy when using the Credentials provider.
  // Database sessions are not supported with credentials-based auth.
  // Revocation works through User.tokenVersion (src/lib/session-version.ts).
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },

  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
    verifyRequest: "/auth/verify-email",
    newUser: "/auth/signup",
  },

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
    session({ session, token }) {
      // Expose user.id from the JWT so server components can read it
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },

  events: {
    async signIn({ user, isNewUser }) {
      if (!user.id) return;
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: isNewUser ? "auth.signup.oauth" : "auth.signin",
        },
      });
    },
  },
});
