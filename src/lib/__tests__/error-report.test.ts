import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildErrorLogLine,
  formatErrorLogLine,
  MAX_MESSAGE_LENGTH,
  scrubErrorMessage,
  suppressRawRequestErrorLogs,
} from "../error-report";
import { onRequestError } from "@/instrumentation";

// Things that must never reach a log line.
const SECRETS = {
  email: "alice@example.com",
  dbUrl: "postgresql://keycrypt:s3cr3t-pass@db.example.com:5432/keycrypt",
  resetToken: "9f3c2a7b1e4d8c6a0b5f9e2d7c1a3b8e",
  jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJlLXZhbHVl",
  ciphertext: "q8Hc0Zl3vT9mXwKp4sJdE1aYwR2xN9mZ7Q==",
  cookie: "authjs.session-token=abc123def456",
  password: "Hunter2-correct-horse",
  actionArg: '{"ciphertext":"Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MA=="}',
};

const NOW = new Date("2026-11-09T21:39:57.000Z");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("scrubErrorMessage", () => {
  it("redacts emails, credentialed URLs, query strings, JWTs and token-like runs", () => {
    const message = [
      `Unique constraint failed for ${SECRETS.email}.`,
      `Can't reach database server at ${SECRETS.dbUrl}`,
      `GET /auth/reset-password?token=${SECRETS.resetToken} failed`,
      `bad session ${SECRETS.jwt}`,
      `could not store ${SECRETS.ciphertext}`,
    ].join("\n");
    const scrubbed = scrubErrorMessage(message);
    for (const secret of [
      SECRETS.email,
      "s3cr3t-pass",
      SECRETS.resetToken,
      SECRETS.jwt,
      SECRETS.ciphertext,
    ]) {
      expect(scrubbed).not.toContain(secret);
    }
    expect(scrubbed).toContain("[email]");
    expect(scrubbed).toContain("[url]");
    expect(scrubbed).toContain("?[query]");
    expect(scrubbed).toContain("[token]");
    expect(scrubbed).toContain("[redacted]");
    expect(scrubbed).not.toContain("\n");
  });

  it("keeps ordinary messages readable", () => {
    expect(scrubErrorMessage("Cannot read properties of undefined (reading 'secret')")).toBe(
      "Cannot read properties of undefined (reading 'secret')"
    );
    expect(scrubErrorMessage("PrismaClientKnownRequestError: Record to update not found.")).toBe(
      "PrismaClientKnownRequestError: Record to update not found."
    );
  });

  it(`truncates to ${MAX_MESSAGE_LENGTH} characters`, () => {
    const scrubbed = scrubErrorMessage("word ".repeat(200));
    expect(scrubbed.length).toBe(MAX_MESSAGE_LENGTH);
    expect(scrubbed.endsWith("…")).toBe(true);
  });
});

describe("buildErrorLogLine", () => {
  it("has exactly the documented fields", () => {
    const error = Object.assign(new TypeError("x is not a function"), { digest: "1234567890" });
    expect(
      buildErrorLogLine({
        error,
        method: "POST",
        routePath: "/vault/settings",
        routeType: "action",
        now: NOW,
      })
    ).toEqual({
      level: "error",
      event: "request_error",
      route: "/vault/settings",
      routeType: "action",
      method: "POST",
      name: "TypeError",
      message: "x is not a function",
      digest: "1234567890",
      timestamp: "2026-11-09T21:39:57.000Z",
    });
  });

  it("copes with non-Error throws and odd values", () => {
    const line = buildErrorLogLine({
      error: { weird: SECRETS.password },
      method: "get; rm -rf",
      routePath: "/vault?x=1",
      routeType: "render",
      now: NOW,
    });
    expect(line).toMatchObject({
      route: "/vault",
      method: "UNKNOWN",
      name: "object",
      message: "",
      digest: null,
    });
    expect(JSON.stringify(line)).not.toContain(SECRETS.password);
  });
});

describe("onRequestError (src/instrumentation.ts)", () => {
  it("writes one scrubbed JSON line and nothing from the request", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = Object.assign(
      new Error(`Invalid prisma.user.update() for ${SECRETS.email} with ${SECRETS.ciphertext}`),
      { digest: "987654321" }
    );

    await onRequestError(
      error,
      {
        path: `/auth/reset-password?token=${SECRETS.resetToken}`,
        method: "POST",
        headers: {
          cookie: SECRETS.cookie,
          authorization: `Bearer ${SECRETS.jwt}`,
          "next-action": "abc123",
          "x-forwarded-for": "203.0.113.7",
        },
      },
      {
        routerKind: "App Router",
        routePath: "/auth/reset-password",
        routeType: "action",
        revalidateReason: undefined,
      }
    );

    expect(log).toHaveBeenCalledTimes(1);
    const output = String(log.mock.calls[0]?.[0]);
    expect(output).not.toContain("\n");
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "digest",
        "event",
        "level",
        "message",
        "method",
        "name",
        "route",
        "routeType",
        "timestamp",
      ].sort()
    );
    expect(parsed).toMatchObject({
      route: "/auth/reset-password",
      method: "POST",
      name: "Error",
      digest: "987654321",
    });
    for (const secret of [
      SECRETS.email,
      SECRETS.ciphertext,
      SECRETS.resetToken,
      SECRETS.cookie,
      SECRETS.jwt,
      "203.0.113.7",
      "abc123",
    ]) {
      expect(output).not.toContain(secret);
    }
  });
});

describe("formatErrorLogLine", () => {
  it("is a single JSON line", () => {
    const line = buildErrorLogLine({
      error: new Error("line one\nline two"),
      method: "GET",
      routePath: "/",
      routeType: "render",
      now: NOW,
    });
    const text = formatErrorLogLine(line);
    expect(text).not.toContain("\n");
    expect(JSON.parse(text)).toEqual(line);
  });
});

describe("suppressRawRequestErrorLogs", () => {
  it("drops console.error calls carrying a Next.js digest error and passes everything else", () => {
    const seen: unknown[][] = [];
    const target = { error: (...args: unknown[]) => void seen.push(args) };
    const undo = suppressRawRequestErrorLogs(target);

    const requestError = Object.assign(new Error(`raw ${SECRETS.email}`), { digest: "123" });
    target.error("⨯", requestError); // Next.js's own unscrubbed print
    target.error(requestError);
    target.error("[rate-limit] Upstash request failed", new Error("timeout"));
    target.error("plain message");

    expect(seen).toEqual([
      ["[rate-limit] Upstash request failed", new Error("timeout")],
      ["plain message"],
    ]);
    expect(JSON.stringify(seen)).not.toContain(SECRETS.email);

    undo();
    target.error("⨯", requestError);
    expect(seen).toHaveLength(3);
  });
});
