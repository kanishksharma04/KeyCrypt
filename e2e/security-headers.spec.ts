import { expect, test } from "@playwright/test";

test("the home page sends a nonce-based CSP without unsafe-inline scripts", async ({ request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);

  const csp = response.headers()["content-security-policy"];
  expect(csp, "Content-Security-Policy header").toBeTruthy();

  const directives: Record<string, string[]> = {};
  for (const directive of csp!.split(";")) {
    const [name, ...values] = directive.trim().split(/\s+/);
    if (name) directives[name] = values;
  }

  const scriptSrc = directives["script-src"];
  expect(scriptSrc, "script-src directive").toBeDefined();
  expect(scriptSrc!.some((v) => /^'nonce-[A-Za-z0-9+/=_-]{16,}'$/.test(v))).toBe(true);
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  // Production build: no eval either.
  expect(scriptSrc).not.toContain("'unsafe-eval'");

  expect(response.headers()["strict-transport-security"]).toContain("max-age=");
});

test("each response gets a fresh nonce", async ({ request }) => {
  const nonceOf = async () =>
    (await request.get("/")).headers()["content-security-policy"]?.match(/'nonce-([^']+)'/)?.[1];
  const [a, b] = [await nonceOf(), await nonceOf()];
  expect(a).toBeTruthy();
  expect(a).not.toBe(b);
});
