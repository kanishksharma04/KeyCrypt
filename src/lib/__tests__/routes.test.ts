import { describe, expect, it } from "vitest";
import { PUBLIC_PAGES, routeAccess } from "../routes";

describe("routeAccess (src/proxy.ts)", () => {
  it("keeps the landing page, privacy policy, terms and the offline vault public", () => {
    expect(PUBLIC_PAGES).toEqual(expect.arrayContaining(["/", "/privacy", "/terms", "/offline"]));
    for (const page of PUBLIC_PAGES) expect(routeAccess(page)).toBe("public");
  });

  it("protects the vault", () => {
    for (const path of ["/vault", "/vault/dashboard", "/vault/settings", "/vault/unlock"]) {
      expect(routeAccess(path)).toBe("protected");
    }
  });

  it("keeps sign-in and sign-up for signed-out visitors only", () => {
    expect(routeAccess("/auth/signin")).toBe("auth-only");
    expect(routeAccess("/auth/signup")).toBe("auth-only");
    // Password reset and email verification work signed in or out.
    expect(routeAccess("/auth/forgot-password")).toBe("public");
    expect(routeAccess("/auth/verify-email")).toBe("public");
  });
});
