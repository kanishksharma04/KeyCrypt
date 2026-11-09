// Server error reporting that keeps the zero-knowledge design: one structured
// JSON line on stdout per failed request (Vercel runtime logs, `docker logs`),
// built only from the error and the route pattern. It never takes request
// bodies, headers, cookies, form data, server-action arguments or the request
// path (which can carry tokens in its query string), so it can't log them.
// Nothing is sent to a third party. Used by onRequestError in src/instrumentation.ts.

export const MAX_MESSAGE_LENGTH = 300;

export type ErrorLogLine = {
  level: "error";
  event: "request_error";
  /** Route pattern, e.g. "/vault/settings" or "/api/auth/[...nextauth]". */
  route: string;
  routeType: string;
  method: string;
  /** Error class name, e.g. "TypeError". */
  name: string;
  /** Scrubbed, single-line, at most MAX_MESSAGE_LENGTH characters. */
  message: string;
  /** Next.js error digest, also shown on the error page, to match a report to a log line. */
  digest: string | null;
  timestamp: string;
};

const REDACTIONS: Array<[RegExp, string]> = [
  // Connection strings and other URLs with credentials: scheme://user:pass@host...
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]*@\S*/gi, "[url]"],
  // Query strings (reset and verification tokens travel in them).
  [/\?[^\s"'`]+/g, "?[query]"],
  // Email addresses.
  [/[^\s@"'`<>()[\]{},;:]+@[^\s@"'`<>()[\]{},;:]+\.[a-z]{2,}/gi, "[email]"],
  // JWTs.
  [/\beyJ[\w-]*\.[\w-]+\.[\w-]*/g, "[token]"],
];

// Long runs that look like keys, tokens, hashes or ciphertext (base64, base64url
// or hex, 20+ characters, containing a digit, so long plain words are kept).
const TOKEN_LIKE = /[A-Za-z0-9+/_=-]{20,}/g;

/** Redacts secret-looking substrings, collapses whitespace and truncates. */
export function scrubErrorMessage(message: string, max = MAX_MESSAGE_LENGTH): string {
  let out = message.replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  out = out.replace(TOKEN_LIKE, (run) => (/\d/.test(run) ? "[redacted]" : run));
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

function errorName(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  return /^[\w.$-]{1,100}$/.test(name) ? name : "Error";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function errorDigest(error: unknown): string | null {
  const digest =
    error !== null && typeof error === "object" ? (error as { digest?: unknown }).digest : null;
  return typeof digest === "string" && /^[\w-]{1,64}$/.test(digest) ? digest : null;
}

/**
 * Builds the log line for a failed request. Takes only what it logs: the error,
 * the HTTP method and the route pattern (not the concrete path).
 */
export function buildErrorLogLine(input: {
  error: unknown;
  method: string;
  routePath: string;
  routeType: string;
  now?: Date;
}): ErrorLogLine {
  const route = input.routePath.split("?")[0] ?? "";
  return {
    level: "error",
    event: "request_error",
    route: /^[\w/[\].@()-]{0,200}$/.test(route) ? route : "[unknown]",
    routeType: /^[a-z-]{1,20}$/.test(input.routeType) ? input.routeType : "unknown",
    method: /^[A-Z]{1,10}$/.test(input.method) ? input.method : "UNKNOWN",
    name: errorName(input.error),
    message: scrubErrorMessage(errorMessage(input.error)),
    digest: errorDigest(input.error),
    timestamp: (input.now ?? new Date()).toISOString(),
  };
}

/** The line written to stdout: JSON, no newlines inside. */
export function formatErrorLogLine(line: ErrorLogLine): string {
  return JSON.stringify(line);
}

/** True for an error Next.js gave a digest: a server request error that onRequestError reports. */
function isDigestError(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { digest?: unknown }).digest === "string"
  );
}

/**
 * In production, Next.js also prints each request error itself (`⨯ Error: <message>` plus
 * the stack) with console.error, unscrubbed. This wraps `target.error` so that a call
 * carrying such a digest error is dropped (onRequestError has already logged the scrubbed
 * line); every other console.error call passes through unchanged. Returns an undo function.
 */
export function suppressRawRequestErrorLogs(target: Pick<Console, "error">): () => void {
  const original = target.error;
  target.error = (...args: unknown[]) => {
    if (args.some(isDigestError)) return;
    original.apply(target, args);
  };
  return () => {
    target.error = original;
  };
}
