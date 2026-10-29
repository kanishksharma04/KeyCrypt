import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { authorizeCredentials } from "@/lib/authorize-credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  // Auth.js v5 requires JWT strategy when using the Credentials provider.
  // Database sessions are not supported with credentials-based auth.
  session: { strategy: "jwt" },

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
      // On initial sign-in, user is present — persist id into the token
      if (user?.id) token.sub = user.id;
      return token;
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
