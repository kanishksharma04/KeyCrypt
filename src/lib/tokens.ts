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

export async function generateToken(type: TokenType, email: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TOKEN_EXPIRY_MINUTES[type] * 60 * 1000);

  // Delete any existing token for this identifier before creating a new one
  await db.verificationToken.deleteMany({
    where: { identifier: identifier(type, email) },
  });

  await db.verificationToken.create({
    data: { identifier: identifier(type, email), token, expires },
  });

  return token;
}

export async function consumeToken(
  type: TokenType,
  email: string,
  token: string
): Promise<boolean> {
  const record = await db.verificationToken.findUnique({
    where: { identifier_token: { identifier: identifier(type, email), token } },
  });

  if (!record) return false;
  if (record.expires < new Date()) {
    await db.verificationToken.delete({
      where: { identifier_token: { identifier: identifier(type, email), token } },
    });
    return false;
  }

  await db.verificationToken.delete({
    where: { identifier_token: { identifier: identifier(type, email), token } },
  });

  return true;
}
