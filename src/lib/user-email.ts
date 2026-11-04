import type { Prisma } from "@prisma/client";

// Account emails are compared without regard to case: "Alice@x.com" and
// "alice@x.com" are the same account. The auth schemas (src/schemas/auth.ts)
// trim and lower-case every email, so new accounts are stored lower-cased.
// Accounts created before that may still have capitals, so lookups by email
// are case-insensitive. Should two old accounts differ only in case, the
// oldest one is used.

/** findFirst arguments that match a user by email, whatever its case. */
export function byEmail(email: string) {
  return {
    where: { email: { equals: email, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
  } satisfies Pick<Prisma.UserFindFirstArgs, "where" | "orderBy">;
}
