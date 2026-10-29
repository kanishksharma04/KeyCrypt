import type { DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  interface User {
    /** User.tokenVersion at sign-in; copied onto the JWT. */
    tokenVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    sub: string;
    /** User.tokenVersion when this token was issued (see src/lib/session-version.ts). */
    tokenVersion?: number;
    /** Epoch ms of the last tokenVersion check against the database. */
    verCheckedAt?: number;
  }
}
