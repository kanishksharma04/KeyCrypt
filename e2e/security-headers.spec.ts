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
  // Production build: no eval either. WebAssembly compilation alone is allowed
  // for the Argon2id KDF.
  expect(scriptSrc).not.toContain("'unsafe-eval'");
  expect(scriptSrc).toContain("'wasm-unsafe-eval'");

  // Same origin, plus the opt-in breached-password check (k-anonymity range API).
  expect(directives["connect-src"]).toEqual(["'self'", "https://api.pwnedpasswords.com"]);

  expect(response.headers()["strict-transport-security"]).toContain("max-age=");
});

test("serves /.well-known/security.txt (RFC 9116) and links the policy from the home page", async ({
  request,
  page,
}) => {
  const response = await request.get("/.well-known/security.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^text\/plain/);
  const body = await response.text();
  expect(body).toMatch(
    /^Contact: https:\/\/github\.com\/kanishksharma04\/KeyCrypt\/security\/advisories\/new$/m
  );
  expect(body).toMatch(/^Expires: 2027-11-03T00:00:00\.000Z$/m);
  expect(body).toMatch(/^Policy: .+\/SECURITY\.md$/m);

  await page.goto("/");
  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: /Security policy/ })).toHaveAttribute(
    "href",
    /SECURITY\.md$/
  );
  await expect(footer.getByRole("link", { name: /Threat model/ })).toHaveAttribute(
    "href",
    /docs\/threat-model\.md$/
  );
  await expect(footer.getByRole("link", { name: "security.txt" })).toHaveAttribute(
    "href",
    "/.well-known/security.txt"
  );
});

test("each response gets a fresh nonce", async ({ request }) => {
  const nonceOf = async () =>
    (await request.get("/")).headers()["content-security-policy"]?.match(/'nonce-([^']+)'/)?.[1];
  const [a, b] = [await nonceOf(), await nonceOf()];
  expect(a).toBeTruthy();
  expect(a).not.toBe(b);
});
