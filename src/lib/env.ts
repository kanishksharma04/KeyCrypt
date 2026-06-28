import { z } from "zod";

// Validate required server-side environment variables at startup.
// Import this module in the root layout so errors surface immediately,
// not when a route handler first tries to use a missing variable.
const schema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid connection URL"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL must be a valid URL")
    .optional()
    .default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Missing or invalid environment variables:\n${issues}`);
}

export const env = parsed.data;
