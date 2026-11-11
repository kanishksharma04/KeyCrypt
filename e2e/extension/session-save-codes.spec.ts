import { createServer, type Server } from "http";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";
import { saveRecoveryKit } from "../recovery-kit";
import { TEST_PAGE_ORIGIN } from "./global-setup";

// The extension stays unlocked for a while (the background worker keeps the
// key), fills a login's TOTP code, and offers to save a login submitted on a page.

declare const chrome: {
  tabs: { query(q: { url: string }): Promise<Array<{ id?: number }>> };
};

const run = Date.now();
const ACCOUNT = { email: `e2e-ext2-${run}@test.local`, password: "Account-Pass-123!" };
const MASTER = "Extension-Master-2!";
const OTP_SECRET = "HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ";
const SITE_LOGIN = {
  name: "Code site",
  username: "coder@example.test",
  password: "Code-Site-Pa55!",
  url: `${TEST_PAGE_ORIGIN}/otp`,
};
const NEW_LOGIN = { username: "newbie@example.test", password: "Brand-New-Pa55!" };

const PAGES: Record<string, string> = {
  "/otp": `<!doctype html><title>Code</title>
    <form><input id="code" name="code" autocomplete="one-time-code" inputmode="numeric"></form>`,
  // A single-page-app style form: the page handles submit itself and stays put.
  "/signup": `<!doctype html><title>Sign up</title>
    <form id="f" onsubmit="event.preventDefault(); document.title = 'Submitted'">
      <input type="email" name="email" id="email" autocomplete="username">
      <input type="password" name="password" id="password">
      <button>Create account</button>
    </form>`,
};

let server: Server;
let context: BrowserContext;
const extensionId = () => process.env.KEYCRYPT_E2E_EXTENSION_ID ?? "";

test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(PAGES[new URL(req.url ?? "/", TEST_PAGE_ORIGIN).pathname] ?? "<title>ok</title>");
  });
  await new Promise<void>((done) => server.listen(4599, "127.0.0.1", done));
  const dir = process.env.KEYCRYPT_E2E_EXTENSION_DIR ?? "";
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "kc-ext2-")), {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
  });
});

test.afterAll(async () => {
  await context?.close();
  await new Promise((done) => server?.close(done));
});

async function openPopup(tabUrl: string): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId()}/popup.html`);
  const tabId = await popup.evaluate(
    async (url) => (await chrome.tabs.query({ url }))[0]?.id,
    tabUrl
  );
  expect(tabId).toBeTruthy();
  await popup.goto(`chrome-extension://${extensionId()}/popup.html?tabId=${tabId}`);
  return popup;
}

function referenceCodes(): string[] {
  const totp = new TOTP({ secret: Secret.fromBase32(OTP_SECRET), digits: 6, period: 30 });
  const now = Date.now();
  return [now - 30_000, now, now + 30_000].map((timestamp) => totp.generate({ timestamp }));
}

async function signUpWithVault(baseURL: string): Promise<Page> {
  const app = await context.newPage();
  await app.goto(`${baseURL}/auth/signup`);
  await app.locator("#name").fill("Extension User 2");
  await app.locator("#email").fill(ACCOUNT.email);
  await app.locator("#password").fill(ACCOUNT.password);
  await app.locator("#confirmPassword").fill(ACCOUNT.password);
  await app.getByRole("button", { name: "Create account" }).click();
  await expect(app).toHaveURL(/\/auth\/signin$/);
  await app.locator("#email").fill(ACCOUNT.email);
  await app.locator("#password").fill(ACCOUNT.password);
  await app.getByRole("button", { name: "Sign in" }).click();
  await expect(app).toHaveURL(/\/vault\/setup$/);
  await app.locator("#masterPassword").fill(MASTER);
  await app.locator("#confirmPassword").fill(MASTER);
  await app.getByRole("button", { name: "Create vault" }).click();
  const confirm = app.getByRole("dialog");
  await confirm.locator("#confirm-account-password").fill(ACCOUNT.password);
  await confirm.getByRole("button", { name: "Create vault" }).click();
  await saveRecoveryKit(app);

  await app.getByRole("button", { name: "New item" }).click();
  await app.getByRole("menuitem", { name: "Login" }).click();
  const d = app.getByRole("dialog");
  await d.locator("#item-name").fill(SITE_LOGIN.name);
  await d.locator("#item-username").fill(SITE_LOGIN.username);
  await d.locator("#item-password").fill(SITE_LOGIN.password);
  await d.locator("#item-url").fill(SITE_LOGIN.url);
  await d.locator("#item-totp").fill(OTP_SECRET);
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d).toBeHidden();
  return app;
}

test("stays unlocked, fills TOTP codes and offers to save new logins", async ({ baseURL }) => {
  const app = await signUpWithVault(baseURL ?? "");
  const codePage = await context.newPage();
  await codePage.goto(SITE_LOGIN.url);

  // Unlock once (10 minutes by default)…
  let popup = await openPopup(`${TEST_PAGE_ORIGIN}/otp`);
  await expect(popup.locator("#unlock-minutes")).toHaveValue("10");
  await popup.locator("#master-password").fill(MASTER);
  await popup.getByRole("button", { name: "Unlock" }).click();
  await expect(popup.getByRole("list", { name: "Logins for 127.0.0.1" })).toBeVisible();
  await popup.close();

  // …and the popup opened again needs no master password.
  popup = await openPopup(`${TEST_PAGE_ORIGIN}/otp`);
  const list = popup.getByRole("list", { name: "Logins for 127.0.0.1" });
  await expect(list.getByText(SITE_LOGIN.name)).toBeVisible();
  await expect(popup.locator("#master-password")).toHaveCount(0);
  await expect(popup.getByText(/Stays unlocked for about \d+ more min\./)).toBeVisible();

  // Fill the login's TOTP code (the popup closes itself after filling).
  const closed = popup.waitForEvent("close");
  await list
    .getByTitle(`Fill the code for ${SITE_LOGIN.name}`)
    .evaluate((button: HTMLElement) => button.click());
  await closed;
  const filled = await codePage.locator("#code").inputValue();
  expect(referenceCodes()).toContain(filled);

  // Submit a new login on a page: the extension offers to save it.
  const signupPage = await context.newPage();
  await signupPage.goto(`${TEST_PAGE_ORIGIN}/signup`);
  await signupPage.locator("#email").fill(NEW_LOGIN.username);
  await signupPage.locator("#password").fill(NEW_LOGIN.password);
  await signupPage.getByRole("button", { name: "Create account" }).click();
  await expect(signupPage).toHaveTitle("Submitted");

  popup = await openPopup(`${TEST_PAGE_ORIGIN}/signup`);
  const offer = popup.getByRole("region", { name: "Save login" });
  await expect(offer.getByText("Save login for 127.0.0.1?")).toBeVisible();
  await expect(offer.getByText(NEW_LOGIN.username)).toBeVisible();
  await expect(offer.getByText(NEW_LOGIN.password)).toHaveCount(0); // never shown
  await offer.getByRole("button", { name: "Save login" }).click();
  await expect(popup.getByText("Saved the login for 127.0.0.1.")).toBeVisible();

  // It's in the vault, encrypted by the extension and readable in the web app.
  // (Reloading locks the web app's vault: its key lives only in page memory.)
  await app.reload();
  await app.locator("#masterPassword").fill(MASTER);
  await app.getByRole("button", { name: "Unlock vault" }).click();
  await expect(app).toHaveURL(/\/vault$/);
  await expect(app.getByText("127.0.0.1", { exact: true }).first()).toBeVisible();
  await expect(app.getByText("2 items")).toBeVisible();

  // Lock: the next opening asks for the master password again.
  await popup.getByRole("button", { name: "Lock" }).click();
  await expect(popup.locator("#master-password")).toBeVisible();
  await popup.close();
  popup = await openPopup(`${TEST_PAGE_ORIGIN}/otp`);
  await expect(popup.locator("#master-password")).toBeVisible();

  // Unlock again, then lose the session cookie (sign-out): the worker drops the
  // key at once. Signing back in doesn't bring it back.
  await popup.locator("#master-password").fill(MASTER);
  await popup.getByRole("button", { name: "Unlock" }).click();
  await expect(popup.getByRole("list", { name: "Logins for 127.0.0.1" })).toBeVisible();
  await popup.close();
  await app.getByRole("button", { name: "Account menu" }).click();
  await app.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(app).toHaveURL(/\/auth\/signin/);
  await app.locator("#email").fill(ACCOUNT.email);
  await app.locator("#password").fill(ACCOUNT.password);
  await app.getByRole("button", { name: "Sign in" }).click();
  await expect(app).toHaveURL(/\/vault/);
  popup = await openPopup(`${TEST_PAGE_ORIGIN}/otp`);
  await expect(popup.locator("#master-password")).toBeVisible();
});
