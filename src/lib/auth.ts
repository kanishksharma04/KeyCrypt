import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
// Uncomment after adding credentials to .env:
// import Google from "next-auth/providers/google"
// import GitHub from "next-auth/providers/github"
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { signInSchema } from "@/schemas/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },

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

        // Require email verification before granting access
        if (!user.emailVerified) {
          // Signal to the client that email is unverified (not a credential error)
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),

    // OAuth — scaffolded. Uncomment when credentials are in .env:
    // Google({
    //   clientId: process.env.GOOGLE_CLIENT_ID!,
    //   clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    // }),
    // GitHub({
    //   clientId: process.env.GITHUB_CLIENT_ID!,
    //   clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    // }),
  ],

  callbacks: {
    session({ session, user }) {
      // Expose user.id in the session (not in JWT; this is database sessions)
      if (session.user) session.user.id = user.id;
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
