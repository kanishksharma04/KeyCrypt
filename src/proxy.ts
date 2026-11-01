import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Edge-safe Auth.js instance: verifies the session JWT (signature + expiry)
// without touching the database. Invalid or tampered tokens yield req.auth = null
// and their cookies are cleared on the response.
const { auth } = NextAuth(authConfig);

// Protected route prefixes
const PROTECTED = ["/vault"];
// Routes that redirect to vault when already signed in
const AUTH_ONLY = ["/auth/signin", "/auth/signup"];

// ─── CSP ──────────────────────────────────────────────────────────────────────

function buildCsp(nonce: string): string {
  const isProd = process.env.NODE_ENV === "production";

  // 'unsafe-eval' is required in dev for Next.js Turbopack HMR; removed in production.
  // 'unsafe-inline' is intentionally absent from script-src — nonce replaces it.
  // 'wasm-unsafe-eval' lets the Argon2id KDF (hash-wasm) compile WebAssembly. It
  // allows WebAssembly compilation only, not eval() or new Function().
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'wasm-unsafe-eval'",
    ...(isProd ? [] : ["'unsafe-eval'"]),
  ].join(" ");

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

// ─── Proxy (Next.js 16 name for middleware; runs on the Node.js runtime) ──────

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;

  // A session whose JWT verified. Revocation (tokenVersion) is checked later,
  // on the Node side, by auth() in each route. Keep the proxy cheap: no Prisma here.
  const isSignedIn = !!req.auth;

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  const isAuthOnly = AUTH_ONLY.some((p) => pathname.startsWith(p));

  if (isProtected && !isSignedIn) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/signin";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthOnly && isSignedIn) {
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
});

export const config = {
  matcher: [
    // Skip Next.js internals, static assets, and the Auth.js API route itself.
    "/((?!_next/static|_next/image|favicon.ico|api/auth).*)",
  ],
};
