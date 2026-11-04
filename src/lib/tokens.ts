import { randomBytes } from "crypto";
import { db } from "@/lib/db";

const TOKEN_EXPIRY_MINUTES = {
  verify: 60 * 24, // 24 hours
  reset: 60, // 1 hour
} as const;

type TokenType = keyof typeof TOKEN_EXPIRY_MINUTES;

function identifier(type: TokenType, email: string) {
  return `${type}:${email}`;
}

/**
 * Matches the tokens of this type for an email, whatever the email's case
 * (emails are case-insensitive; see src/lib/user-email.ts).
 */
export function tokensFor(type: TokenType, email: string) {
  return { identifier: { equals: identifier(type, email), mode: "insensitive" as const } };
}

export async function generateToken(type: TokenType, email: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TOKEN_EXPIRY_MINUTES[type] * 60 * 1000);

  // Delete any existing token for this address before creating a new one
  await db.verificationToken.deleteMany({ where: tokensFor(type, email) });

  await db.verificationToken.create({
    data: { identifier: identifier(type, email), token, expires },
  });

  return token;
}

/** True if the token was valid for this email. It is used up either way. */
export async function consumeToken(
  type: TokenType,
  email: string,
  token: string
): Promise<boolean> {
  const record = await db.verificationToken.findFirst({
    where: { ...tokensFor(type, email), token },
  });
  if (!record) return false;

  // Delete first: only one request can consume a token, even concurrently.
  const { count } = await db.verificationToken.deleteMany({
    where: { identifier: record.identifier, token: record.token },
  });
  return count === 1 && record.expires >= new Date();
}
