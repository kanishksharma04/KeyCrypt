import { NextRequest, NextResponse } from "next/server";

// Protected route prefixes
const PROTECTED = ["/dashboard", "/vault", "/settings"];
// Routes that redirect to vault when already signed in
const AUTH_ONLY = ["/auth/signin", "/auth/signup"];

// ─── CSP ──────────────────────────────────────────────────────────────────────

function buildCsp(nonce: string): string {
  const isProd = process.env.NODE_ENV === "production";

  // 'unsafe-eval' is required in dev for Next.js Turbopack HMR; removed in production.
  // 'unsafe-inline' is intentionally absent from script-src — nonce replaces it.
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, ...(isProd ? [] : ["'unsafe-eval'"])].join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Tailwind v4 injects critical CSS via <style> tags — 'unsafe-inline' required.
    "style-src 'self' 'unsafe-inline'",
    // Self-hosted fonts via next/font; data: for inline SVG backgrounds.
    "img-src 'self' data:",
    "font-src 'self'",
    // Server Actions POST to the same origin; no external API calls.
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // Restricts form submission targets; defence against phishing via form hijack.
    "form-action 'self'",
    // Prevents framing — clickjacking defence (redundant with X-Frame-Options but belt + suspenders).
    "frame-ancestors 'none'",
  ].join("; ");
}

// ─── Middleware ────────────────────────────────────────────────────────────────

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Auth.js stores the session token in one of two cookies (secure vs plain).
  const sessionToken =
    req.cookies.get("authjs.session-token") ?? req.cookies.get("__Secure-authjs.session-token");

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  const isAuthOnly = AUTH_ONLY.some((p) => pathname.startsWith(p));

  // Lightweight redirect guards — real session validation happens in each
  // route via auth() (DB round-trip). Middleware is Edge-only, no Prisma.
  if (isProtected && !sessionToken) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/signin";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthOnly && sessionToken) {
    const url = req.nextUrl.clone();
    url.pathname = "/vault/dashboard";
    return NextResponse.redirect(url);
  }

  // Generate a per-request nonce for the Content-Security-Policy.
  // randomUUID() is available in both Edge Runtime and Node.js runtime.
  const nonce = globalThis.crypto.randomUUID().replace(/-/g, "");

  // Forward the nonce to Next.js so it can stamp its own <script> tags.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Set CSP and hardening headers on the response.
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  response.headers.set("X-Nonce", nonce); // convenience for layout.tsx

  // HSTS — only meaningful over HTTPS; omit in dev to avoid locking localhost.
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  return response;
}

export const config = {
  matcher: [
    // Skip Next.js internals, static assets, and the Auth.js API route itself.
    "/((?!_next/static|_next/image|favicon.ico|api/auth).*)",
  ],
};
