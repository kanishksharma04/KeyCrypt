// Runs once when a server instance starts (Next.js instrumentation hook).

export async function register() {
  // Report missing production settings by name at start-up (never values).
  // src/lib/env.ts still throws for the settings the app cannot run without.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { checkEnv, formatEnvReport } = await import("@/lib/env-check.mjs");
  const result = checkEnv(process.env);
  if (!result.ok || result.missingRecommended.length > 0) {
    console.warn(`[env] ${formatEnvReport(result).replaceAll("\n", "\n[env] ")}`);
  }
}
