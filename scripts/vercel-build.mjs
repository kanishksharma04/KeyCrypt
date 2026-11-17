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
//
// Baseline: a database first created with `db push` already has the 0_init
// tables, so applying 0_init fails with "already exists". Only in that case the
// script marks 0_init as applied (`migrate resolve`, the documented baseline
// step) and deploys again. Any other migration failure fails the build.

import { execSync, spawnSync } from "node:child_process";

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

function needsBaseline(output) {
  // First attempt: applying 0_init hits objects that db push already created.
  const initClashes =
    output.includes("P3018") &&
    /Migration name: 0_init\b/.test(output) &&
    /already exists/.test(output);
  // Later attempts: that failed 0_init is now recorded and blocks deploy (P3009).
  const failedInitRecorded =
    output.includes("P3009") && /The `0_init` migration started at .* failed/.test(output);
  return initClashes || failedInitRecorded;
}

run("prisma generate");

if (process.env.VERCEL_ENV === "production") {
  const pooled = process.env.DATABASE_URL;
  if (!pooled) throw new Error("DATABASE_URL is not set; cannot apply migrations.");
  const env = {
    ...process.env,
    DATABASE_URL: process.env.DIRECT_URL || pooled.replace("-pooler.", "."),
  };

  const deploy = capture("prisma migrate deploy", env);
  if (!deploy.ok) {
    if (!needsBaseline(deploy.output)) throw new Error("prisma migrate deploy failed.");
    console.log("0_init already exists in this database (created with db push): baselining it.");
    run("prisma migrate resolve --applied 0_init", env);
    run("prisma migrate deploy", env);
  }
} else {
  console.log(`Skipping prisma migrate deploy (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}).`);
}

run("next build");
