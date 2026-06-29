import NextAuth, { CredentialsSignin } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { signInSchema } from "@/schemas/auth";

class EmailNotVerifiedError extends CredentialsSignin {
  code = "EMAIL_NOT_VERIFIED" as const;
}

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
      async authorize(credentials) {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
          select: { id: true, email: true, name: true, passwordHash: true, emailVerified: true },
        });

        // Return null for both "user not found" and "wrong password" to avoid
        // leaking which emails are registered (timing-safe implicit in Argon2).
        if (!user?.passwordHash) return null;

        const valid = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        if (!user.emailVerified) {
          throw new EmailNotVerifiedError();
        }

        return { id: user.id, email: user.email, name: user.name };
      },
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
