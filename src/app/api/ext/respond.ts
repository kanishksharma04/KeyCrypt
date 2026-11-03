import { NextResponse } from "next/server";

// JSON helpers for the browser-extension API (src/app/api/ext/*). Responses
// hold ciphertext and vault metadata only, and must never be cached.

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export const unauthorized = () => json({ error: "Not authenticated" }, 401);
export const invalidInput = () => json({ error: "Invalid input" }, 400);
