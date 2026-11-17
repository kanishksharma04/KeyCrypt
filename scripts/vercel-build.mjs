// Vercel build (`vercel-build` in package.json; Vercel runs it instead of `build`).
//
// Production deployments apply pending Prisma migrations before building, so the
// deployed code never runs against an older schema. Preview deployments only
// build: they may share the production database, and a branch's migrations must
// not reach it before the branch is merged.
//
// Prisma Migrate needs a direct connection (it takes an advisory lock, which a
// PgBouncer pooler does not support). It uses DIRECT_URL when set; otherwise the
// direct host is derived from a Neon pooler URL by dropping "-pooler".
// The connection string is never printed.

import { execSync } from "node:child_process";

function run(command, env = process.env) {
  console.log(`> ${command}`);
  execSync(command, { stdio: "inherit", env });
}

run("prisma generate");

if (process.env.VERCEL_ENV === "production") {
  const pooled = process.env.DATABASE_URL;
  if (!pooled) throw new Error("DATABASE_URL is not set; cannot apply migrations.");
  const direct = process.env.DIRECT_URL || pooled.replace("-pooler.", ".");
  run("prisma migrate deploy", { ...process.env, DATABASE_URL: direct });
} else {
  console.log(`Skipping prisma migrate deploy (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}).`);
}

run("next build");
