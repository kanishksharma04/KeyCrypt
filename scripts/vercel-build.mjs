// Vercel build (`vercel-build` in package.json; Vercel runs it instead of `build`).
//
// Production deployments apply pending Prisma migrations before building, so the
// deployed code never runs against an older schema.
//
// Preview deployments only build, unless opted in with PREVIEW_MIGRATIONS=1 on
// the Preview environment. Then they migrate their own database first, so a
// branch's migration is tried on a preview database before it reaches
// production. The build refuses (and fails) when the preview database looks like
// the production one: PRODUCTION_DATABASE_HOST must be set on Preview to the
// production database's host name, and must differ from the preview's hosts.
// See planMigrations() in scripts/lib/migration-plan.mjs.
//
// Prisma Migrate needs a direct connection (it takes an advisory lock, which a
// PgBouncer pooler does not support). It uses DIRECT_URL when set; otherwise the
// direct host is derived from a Neon pooler URL by dropping "-pooler".
// The connection string is never printed.
//
// Baseline: a database first created with `db push` already has the 0_init
// tables, so applying 0_init fails with "already exists". Only in that case the
// script marks 0_init as applied (`migrate resolve`, the documented baseline
// step) and deploys again. Any other migration failure fails the build.

import { execSync, spawnSync } from "node:child_process";
import { checkEnv, formatEnvReport } from "../src/lib/env-check.mjs";
import { needsBaseline, planMigrations } from "./lib/migration-plan.mjs";

function run(command, env = process.env) {
  console.log(`> ${command}`);
  execSync(command, { stdio: "inherit", env });
}

/** Runs a command, echoing its output, and returns { ok, output }. */
function capture(command, env) {
  console.log(`> ${command}`);
  const result = spawnSync(command, { shell: true, env, encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  return { ok: result.status === 0, output };
}

run("prisma generate");

// Report missing production settings by name (never values). Report only: the
// build carries on, and src/lib/env.ts still fails start-up without the essentials.
if (process.env.VERCEL_ENV === "production") {
  console.log("Production settings (pnpm check:env):");
  console.log(formatEnvReport(checkEnv(process.env)));
}

const plan = planMigrations(process.env);

if (plan.migrate) {
  console.log(`Applying migrations to the ${plan.target} database.`);
  const env = { ...process.env, DATABASE_URL: plan.url };

  const deploy = capture("prisma migrate deploy", env);
  if (!deploy.ok) {
    if (!needsBaseline(deploy.output)) throw new Error("prisma migrate deploy failed.");
    console.log("0_init already exists in this database (created with db push): baselining it.");
    run("prisma migrate resolve --applied 0_init", env);
    run("prisma migrate deploy", env);
  }
} else {
  console.log(`Skipping prisma migrate deploy (${plan.reason}).`);
}

run("next build");
