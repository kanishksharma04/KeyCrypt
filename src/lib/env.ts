import { z } from "zod";

// Validate required server-side environment variables at startup.
// Import this module in the root layout so errors surface immediately,
// not when a route handler first tries to use a missing variable.
const schema = z
  .object({
    DATABASE_URL: z.string().url("DATABASE_URL must be a valid connection URL"),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    NEXT_PUBLIC_APP_URL: z
      .string()
      .url("NEXT_PUBLIC_APP_URL must be a valid URL")
      .optional()
      .default("http://localhost:3000"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    // Optional shared rate-limit store (src/lib/rate-limit.ts). Set both or neither.
    UPSTASH_REDIS_REST_URL: z.string().url("UPSTASH_REDIS_REST_URL must be a valid URL").optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    // Optional: enables two-factor sign-in. 32 random bytes, base64
    // (openssl rand -base64 32). Encrypts users' TOTP secrets at rest.
    TOTP_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").byteLength === 32, {
        message: "TOTP_ENCRYPTION_KEY must be 32 random bytes, base64-encoded",
      })
      .optional(),
  })
  .refine((e) => !!e.UPSTASH_REDIS_REST_URL === !!e.UPSTASH_REDIS_REST_TOKEN, {
    message: "Set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or neither",
    path: ["UPSTASH_REDIS_REST_URL"],
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Missing or invalid environment variables:\n${issues}`);
}

export const env = parsed.data;
