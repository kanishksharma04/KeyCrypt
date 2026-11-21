import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { saveRecoveryKit } from "./recovery-kit";

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });
test.afterAll(() => db.$disconnect());

// Core vault flow against a production build:
// sign up → set master password → create one item of each type → reload (locks)
// → unlock → copy the login password → change master password → lock → unlock
// with the new password → every item decrypts to the values entered.

const run = Date.now();
const ACCOUNT = {
  name: "E2E User",
  email: `e2e-${run}@test.local`,
  password: "Account-Pass-123!",
};
const MASTER_1 = "First-Master-Pass-1!";
const MASTER_2 = "Second-Master-Pass-2!";

const LOGIN = {
  name: "GitHub",
  username: "octocat",
  password: "gh-S3cret-Pa55!",
  url: "https://github.com",
};
const NOTE = { name: "Recovery codes", content: "alpha-bravo-charlie 12345-67890" };
const API_KEY = {
  name: "Stripe",
  key: "sk_test_e2e_0123456789abcdef",
  description: "Test-mode key",
};
const WIFI = {
  name: "Home WiFi",
  ssid: "KeyCrypt-Net",
  password: "wifi-Pa55-w0rd",
  security: "WPA3",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function confirmAccountPassword(page: Page, buttonName: string) {
  const dialog = page.getByRole("dialog");
  await dialog.locator("#confirm-account-password").fill(ACCOUNT.password);
  await dialog.getByRole("button", { name: buttonName }).click();
}

async function createItem(page: Page, menuLabel: string, fill: (dialog: Locator) => Promise<void>) {
  await page.getByRole("button", { name: "New item" }).click();
  await page.getByRole("menuitem", { name: menuLabel }).click();
  const dialog = page.getByRole("dialog");
  await fill(dialog);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
}

async function unlock(page: Page, masterPassword: string) {
  await expect(page).toHaveURL(/\/vault\/unlock$/);
  await page.locator("#masterPassword").fill(masterPassword);
  await page.getByRole("button", { name: "Unlock vault" }).click();
}

async function openItem(page: Page, name: string): Promise<Locator> {
  await page.getByTitle("View item").filter({ hasText: name }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name })).toBeVisible();
  return dialog;
}

async function closeDialog(page: Page) {
  await page.keyboard.press("Escape");
  // Count rather than toBeHidden(): two dialogs can be animating out at once
  // (e.g. the palette and the item it opened), which a strict locator rejects.
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

// ─── Flow ────────────────────────────────────────────────────────────────────

test("sign up, store four items, change master password, and read them all back", async ({
  page,
}) => {
  // Sign up (no SMTP in e2e, so the account is verified immediately).
  await page.goto("/auth/signup");
  await page.locator("#name").fill(ACCOUNT.name);
  await page.locator("#email").fill(ACCOUNT.email);
  await page.locator("#password").fill(ACCOUNT.password);
  await page.locator("#confirmPassword").fill(ACCOUNT.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/auth\/signin$/);

  // Sign in → no vault yet → setup.
  await page.locator("#email").fill(ACCOUNT.email);
  await page.locator("#password").fill(ACCOUNT.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/vault\/setup$/);

  // The master password may not equal the account password (checked in the browser).
  await page.locator("#masterPassword").fill(ACCOUNT.password);
  await page.locator("#confirmPassword").fill(ACCOUNT.password);
  await page.getByRole("button", { name: "Create vault" }).click();
  await confirmAccountPassword(page, "Create vault");
  await expect(
    page.getByText("Use a different password from your account password.")
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden(); // closed, error shown on the form

  // Set the real master password.
  await page.locator("#masterPassword").fill(MASTER_1);
  await page.locator("#confirmPassword").fill(MASTER_1);
  await page.getByRole("button", { name: "Create vault" }).click();
  await confirmAccountPassword(page, "Create vault");
  await saveRecoveryKit(page);

  // New vaults are crypto v2 with an Argon2id key-encryption key.
  const meta = await db.vaultMeta.findFirstOrThrow({ where: { user: { email: ACCOUNT.email } } });
  expect(meta).toMatchObject({ cryptoVersion: 2, kdf: "argon2id" });
  expect(meta.wrappedVaultKey).toHaveLength(64);

  // One item of each type.
  await createItem(page, "Login", async (d) => {
    await d.locator("#item-name").fill(LOGIN.name);
    await d.locator("#item-username").fill(LOGIN.username);
    await d.locator("#item-password").fill(LOGIN.password);
    await d.locator("#item-url").fill(LOGIN.url);
  });
  await createItem(page, "Secure Note", async (d) => {
    await d.locator("#note-name").fill(NOTE.name);
    await d.locator("#note-content").fill(NOTE.content);
  });
  await createItem(page, "API Key", async (d) => {
    await d.locator("#ak-name").fill(API_KEY.name);
    await d.locator("#ak-key").fill(API_KEY.key);
    await d.locator("#ak-description").fill(API_KEY.description);
  });
  await createItem(page, "Wi-Fi password", async (d) => {
    await d.locator("#wifi-name").fill(WIFI.name);
    await d.locator("#wifi-ssid").fill(WIFI.ssid);
    await d.locator("#wifi-password").fill(WIFI.password);
    await d.locator("#wifi-security").selectOption(WIFI.security);
  });
  await expect(page.getByText("4 items")).toBeVisible();

  // Reloading drops the in-memory key: the vault locks.
  await page.reload();
  await unlock(page, MASTER_1);
  await expect(page).toHaveURL(/\/vault$/);

  // Copy the login password and read it back from the clipboard.
  const login = await openItem(page, LOGIN.name);
  await login.getByRole("button", { name: "Copy password" }).click();
  await expect(page.getByText("Copied. Clipboard clears in 30 seconds.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(LOGIN.password);
  await closeDialog(page);

  // Change the master password (client-side navigation keeps the vault unlocked).
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/vault\/settings$/);

  // Settings → Recent activity shows real entries with browser (and IP when known).
  const activity = page.getByRole("list", { name: "Recent activity" });
  await expect(activity.getByText("Signed in")).toBeVisible();
  await expect(activity.getByText("Vault created")).toBeVisible();
  await expect(activity.getByText("Item created (login)")).toBeVisible();
  await expect(activity.getByText(/Chrome on \w+/).first()).toBeVisible();
  console.log("recent activity (first entry):", await activity.locator("li").first().innerText());
  await page.locator("#cmp-current").fill(MASTER_1);
  await page.locator("#cmp-new").fill(MASTER_2);
  await page.locator("#cmp-confirm").fill(MASTER_2);
  await page.getByRole("button", { name: "Change master password" }).click();
  await confirmAccountPassword(page, "Continue");
  await expect(page.getByText("Master password changed successfully.")).toBeVisible({
    timeout: 60_000,
  });

  // Lock, then the old master password no longer works and the new one does.
  await page.getByRole("button", { name: "Lock vault" }).click();
  await unlock(page, MASTER_1);
  await expect(page.getByText("Incorrect master password. Please try again.")).toBeVisible();
  await page.locator("#masterPassword").fill(MASTER_2);
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await expect(page).toHaveURL(/\/vault$/);
  await expect(page.getByText("4 items")).toBeVisible();

  // Every item decrypts to exactly what was entered.
  let d = await openItem(page, LOGIN.name);
  await expect(d.getByText(LOGIN.username)).toBeVisible();
  // The details panel shows a web URL as an "Open website" link, not as text.
  await expect(d.getByRole("link", { name: "Open website" })).toHaveAttribute("href", LOGIN.url);
  await d.getByRole("button", { name: "Reveal" }).click();
  await expect(d.getByText(LOGIN.password, { exact: true })).toBeVisible();
  await closeDialog(page);

  d = await openItem(page, NOTE.name);
  await expect(d.getByText(NOTE.content, { exact: true })).toBeVisible();
  await closeDialog(page);

  d = await openItem(page, API_KEY.name);
  await d.getByRole("button", { name: "Reveal" }).click();
  await expect(d.getByText(API_KEY.key, { exact: true })).toBeVisible();
  await expect(d.getByText(API_KEY.description, { exact: true })).toBeVisible();
  await closeDialog(page);

  d = await openItem(page, WIFI.name);
  await expect(d.getByText(WIFI.ssid, { exact: true })).toBeVisible();
  await d.getByRole("button", { name: "Reveal" }).click();
  await expect(d.getByText(WIFI.password, { exact: true })).toBeVisible();
  await expect(d.getByText(WIFI.security, { exact: true })).toBeVisible();
  await closeDialog(page);

  // Names are encrypted: the server stores no plain-text name for any item…
  const rows = await db.vaultItem.findMany({ where: { user: { email: ACCOUNT.email } } });
  expect(rows).toHaveLength(4);
  for (const r of rows) {
    expect(r.name).toBeNull();
    for (const n of [LOGIN.name, NOTE.name, API_KEY.name, WIFI.name]) {
      expect(r.ciphertext).not.toContain(n);
    }
  }

  // …yet search works on the names decrypted in the browser,
  const search = page.getByRole("textbox", { name: "Search vault items" });
  await search.fill("strip");
  await expect(page.getByText("1 of 4 items")).toBeVisible();
  await expect(page.getByTitle("View item").filter({ hasText: API_KEY.name })).toBeVisible();
  await search.fill("");

  // the command palette finds and opens items by name,
  await page
    .getByRole("button", { name: /Search/ })
    .first()
    .click();
  await page.getByPlaceholder("Search items or run a command…").fill("Home Wi");
  await page.getByRole("option", { name: WIFI.name }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: WIFI.name })).toBeVisible();
  await closeDialog(page);

  // and the dashboard health score still decrypts the logins.
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/\/vault\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Vault health" })).toBeVisible();

  // Opt-in breached-password check: the CSP lets the browser call the range API,
  // and only 5-hex-char prefixes go out. (Stubbed here: no real network call.)
  const { createHash } = await import("crypto");
  const loginHash = createHash("sha1").update(LOGIN.password).digest("hex").toUpperCase();
  const rangeRequests: string[] = [];
  await page.route("https://api.pwnedpasswords.com/range/*", async (route) => {
    const request = route.request();
    rangeRequests.push(request.url());
    expect(request.headers()["add-padding"]).toBe("true");
    const prefix = request.url().slice(-5);
    const body = prefix === loginHash.slice(0, 5) ? `${loginHash.slice(5)}:7\r\n` : "";
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      headers: { "access-control-allow-origin": "*" },
      body: `${body}${"0".repeat(35)}:0`,
    });
  });
  await page.getByRole("button", { name: "Check for breached passwords" }).click();
  await expect(
    page.getByText("1 of your passwords appeared in known data breaches. Change them.")
  ).toBeVisible();
  await expect(page.getByText("Found in a data breach")).toBeVisible();
  expect(rangeRequests).toEqual([`https://api.pwnedpasswords.com/range/${loginHash.slice(0, 5)}`]);
});
