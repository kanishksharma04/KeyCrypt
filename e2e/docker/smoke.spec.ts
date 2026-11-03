import { expect, test } from "@playwright/test";
import { saveRecoveryKit } from "../recovery-kit";

// The Docker image works end to end: migrations ran at start-up, and sign-up,
// vault setup and adding an item work (Argon2id, Prisma and the CSP included).

const run = Date.now();
const ACCOUNT = { email: `docker-smoke-${run}@test.local`, password: "Account-Pass-123!" };
const MASTER = "Docker-Master-Pass-1!";
const LOGIN = { name: "Self-hosted test", username: "docker-user", password: "D0cker-S3cret!" };

test("sign up, set up the vault and add an item on the Docker image", async ({ page, request }) => {
  const security = await request.get("/.well-known/security.txt");
  expect(security.status()).toBe(200);

  await page.goto("/auth/signup");
  await page.locator("#name").fill("Docker Smoke");
  await page.locator("#email").fill(ACCOUNT.email);
  await page.locator("#password").fill(ACCOUNT.password);
  await page.locator("#confirmPassword").fill(ACCOUNT.password);
  await page.getByRole("button", { name: "Create account" }).click();
  // Without SMTP, new accounts are verified automatically.
  await expect(page).toHaveURL(/\/auth\/signin$/);
  await page.locator("#email").fill(ACCOUNT.email);
  await page.locator("#password").fill(ACCOUNT.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/vault\/setup$/);
  await page.locator("#masterPassword").fill(MASTER);
  await page.locator("#confirmPassword").fill(MASTER);
  await page.getByRole("button", { name: "Create vault" }).click();
  const confirm = page.getByRole("dialog");
  await confirm.locator("#confirm-account-password").fill(ACCOUNT.password);
  await confirm.getByRole("button", { name: "Create vault" }).click();
  await saveRecoveryKit(page);

  await page.getByRole("button", { name: "New item" }).click();
  await page.getByRole("menuitem", { name: "Login" }).click();
  const d = page.getByRole("dialog");
  await d.locator("#item-name").fill(LOGIN.name);
  await d.locator("#item-username").fill(LOGIN.username);
  await d.locator("#item-password").fill(LOGIN.password);
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d).toBeHidden();

  // Lock, unlock, and read it back: it was stored and decrypts.
  await page.getByRole("button", { name: "Lock vault" }).click();
  await expect(page).toHaveURL(/\/vault\/unlock$/);
  await page.locator("#masterPassword").fill(MASTER);
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await expect(page).toHaveURL(/\/vault$/);
  await page.getByTitle("View item").filter({ hasText: LOGIN.name }).click();
  const view = page.getByRole("dialog");
  await expect(view.getByText(LOGIN.username)).toBeVisible();
  await view.getByRole("button", { name: "Reveal" }).click();
  await expect(view.getByText(LOGIN.password, { exact: true })).toBeVisible();
});
