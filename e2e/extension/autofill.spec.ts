import { createServer, type Server } from "http";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { saveRecoveryKit } from "../recovery-kit";
import { TEST_PAGE_ORIGIN } from "./global-setup";

// The bits of the extension API used inside the popup page below.
declare const chrome: {
  tabs: { query(q: { url: string }): Promise<Array<{ id?: number }>> };
  storage?: unknown;
};

// Load the unpacked extension in Chromium, unlock it with the master password
// and fill a test login form.

const run = Date.now();
const ACCOUNT = { email: `e2e-ext-${run}@test.local`, password: "Account-Pass-123!" };
const MASTER = "Extension-Master-1!";
const SITE_LOGIN = {
  name: "Test site",
  username: "tester@example.test",
  password: "Fill-Me-Pa55!",
  url: `${TEST_PAGE_ORIGIN}/login`,
};
const OTHER_LOGIN = {
  name: "Other site",
  username: "other",
  password: "Other-Pa55!",
  url: "https://other.example.com",
};

const LOGIN_PAGE = `<!doctype html><title>Test login</title>
<form id="f" action="/done" method="post">
  <input type="text" name="q" placeholder="Search">
  <input type="email" name="email" id="email" autocomplete="username">
  <input type="password" name="password" id="password">
  <button>Sign in</button>
</form>`;

let server: Server;
let context: BrowserContext;
const extensionId = () => process.env.KEYCRYPT_E2E_EXTENSION_ID!;

test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(LOGIN_PAGE);
  });
  await new Promise<void>((done) => server.listen(4599, "127.0.0.1", done));

  const dir = process.env.KEYCRYPT_E2E_EXTENSION_DIR!;
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "kc-ext-")), {
    channel: "chromium", // full Chromium: headless mode supports extensions
    headless: true,
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
  });
});

test.afterAll(async () => {
  await context?.close();
  await new Promise((done) => server?.close(done));
});

async function openPopup(tabUrlPattern?: string): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId()}/popup.html`);
  if (!tabUrlPattern) return popup;
  const tabId = await popup.evaluate(
    async (url) => (await chrome.tabs.query({ url }))[0]?.id,
    tabUrlPattern
  );
  expect(tabId).toBeTruthy();
  await popup.goto(`chrome-extension://${extensionId()}/popup.html?tabId=${tabId}`);
  return popup;
}

async function addLogin(page: Page, login: typeof SITE_LOGIN) {
  await page.getByRole("button", { name: "New item" }).click();
  await page.getByRole("menuitem", { name: "Login" }).click();
  const d = page.getByRole("dialog");
  await d.locator("#item-name").fill(login.name);
  await d.locator("#item-username").fill(login.username);
  await d.locator("#item-password").fill(login.password);
  await d.locator("#item-url").fill(login.url);
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d).toBeHidden();
}

test("unlocks locally and fills a login form", async ({ baseURL }) => {
  // Not signed in yet: the popup says so.
  let popup = await openPopup();
  await expect(popup.getByText("You're not signed in to KeyCrypt in this browser.")).toBeVisible();
  // The extension has no storage permission: the key can't end up in chrome.storage.
  expect(await popup.evaluate(() => typeof chrome.storage)).toBe("undefined");
  await popup.close();

  // Sign up and create the vault in the web app (same browser profile).
  const app = await context.newPage();
  await app.goto(`${baseURL}/auth/signup`);
  await app.locator("#name").fill("Extension User");
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
  await addLogin(app, SITE_LOGIN);
  await addLogin(app, OTHER_LOGIN);

  // The test site's login page.
  const site = await context.newPage();
  await site.goto(SITE_LOGIN.url);

  // Popup for that tab: unlock (wrong password first), then fill.
  popup = await openPopup(`${TEST_PAGE_ORIGIN}/*`);
  await popup.locator("#master-password").fill("not-the-master-password");
  await popup.getByRole("button", { name: "Unlock" }).click();
  await expect(popup.getByText("Incorrect master password.")).toBeVisible();
  await popup.locator("#master-password").fill(MASTER);
  await popup.getByRole("button", { name: "Unlock" }).click();

  const list = popup.getByRole("list", { name: "Logins for 127.0.0.1" });
  await expect(list.getByRole("button")).toHaveCount(1); // the other site's login isn't offered
  await expect(list.getByText(SITE_LOGIN.name)).toBeVisible();
  await expect(list.getByText(SITE_LOGIN.username)).toBeVisible();

  // The popup fills, then closes itself: listen for that before clicking, and
  // click from inside the page so Playwright doesn't wait on a closing page.
  const closed = popup.waitForEvent("close");
  await list
    .getByTitle(`Fill ${SITE_LOGIN.name}`)
    .evaluate((button: HTMLElement) => button.click());
  await closed;
  await expect(site.locator("#email")).toHaveValue(SITE_LOGIN.username);
  await expect(site.locator("#password")).toHaveValue(SITE_LOGIN.password);
  await expect(site.locator('input[name="q"]')).toHaveValue(""); // the search box is left alone
});
