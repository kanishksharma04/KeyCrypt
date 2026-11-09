// Next.js instrumentation hooks.

import type { Instrumentation } from "next";
import {
  buildErrorLogLine,
  formatErrorLogLine,
  suppressRawRequestErrorLogs,
} from "@/lib/error-report";

export async function register() {
  // Report missing production settings by name at start-up (never values).
  // src/lib/env.ts still throws for the settings the app cannot run without.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Request errors are logged once, scrubbed, by onRequestError below; stop Next.js
  // printing the raw message and stack as well. Development keeps the full output.
  suppressRawRequestErrorLogs(console);

  const { checkEnv, formatEnvReport } = await import("@/lib/env-check.mjs");
  const result = checkEnv(process.env);
  if (!result.ok || result.missingRecommended.length > 0) {
    console.warn(`[env] ${formatEnvReport(result).replaceAll("\n", "\n[env] ")}`);
  }
}

/**
 * One scrubbed JSON line on stdout per failed server request (see
 * src/lib/error-report.ts). Only the method and the route pattern are taken
 * from the request: never its path, headers, cookies, body or action arguments.
 * Nothing is sent to any other service.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  console.log(
    formatErrorLogLine(
      buildErrorLogLine({
        error,
        method: request.method,
        routePath: context.routePath,
        routeType: context.routeType,
      })
    )
  );
};
