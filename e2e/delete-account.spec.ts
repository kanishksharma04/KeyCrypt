import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { saveRecoveryKit } from "./recovery-kit";

// Settings → Danger zone: type the account email, confirm the account password,
// and every row for the user is gone; the account can no longer sign in.

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });
test.afterAll(() => db.$disconnect());

const run = Date.now();
const ACCOUNT = { email: `e2e-delete-${run}@test.local`, password: "Account-Pass-123!" };
const MASTER = "Delete-Me-Master-1!";

async function confirmAccountPassword(page: Page, buttonName: string) {
  const dialog = page.getByRole("dialog");
  await dialog.locator("#confirm-account-password").fill(ACCOUNT.password);
  await dialog.getByRole("button", { name: buttonName }).click();
}

async function signIn(page: Page) {
  await page.locator("#email").fill(ACCOUNT.email);
  await page.locator("#password").fill(ACCOUNT.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("delete the account from settings", async ({ page }) => {
  await page.goto("/auth/signup");
  await page.locator("#name").fill("Delete Me");
  await page.locator("#email").fill(ACCOUNT.email);
  await page.locator("#password").fill(ACCOUNT.password);
  await page.locator("#confirmPassword").fill(ACCOUNT.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/auth\/signin$/);
  await signIn(page);
  await expect(page).toHaveURL(/\/vault\/setup$/);
  await page.locator("#masterPassword").fill(MASTER);
  await page.locator("#confirmPassword").fill(MASTER);
  await page.getByRole("button", { name: "Create vault" }).click();
  await confirmAccountPassword(page, "Create vault");
  await saveRecoveryKit(page);

  // One item so there is vault data to delete.
  await page.getByRole("button", { name: "New item" }).click();
  await page.getByRole("menuitem", { name: "Secure Note" }).click();
  const d = page.getByRole("dialog");
  await d.locator("#note-name").fill("Soon gone");
  await d.locator("#note-content").fill("bye");
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d).toBeHidden();

  const user = await db.user.findUniqueOrThrow({ where: { email: ACCOUNT.email } });

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/vault\/settings$/);
  await expect(page.getByRole("link", { name: "Export your vault first" })).toHaveAttribute(
    "href",
    "#export-heading"
  );

  // The button stays disabled until the email matches.
  const deleteButton = page.getByRole("button", { name: "Delete account" });
  await expect(deleteButton).toBeDisabled();
  await page.locator("#delete-account-email").fill("someone-else@test.local");
  await expect(deleteButton).toBeDisabled();
  await page.locator("#delete-account-email").fill(ACCOUNT.email.toUpperCase());
  await deleteButton.click();
  await confirmAccountPassword(page, "Delete forever");

  await expect(page).toHaveURL(/\/auth\/signin\?deleted=1$/);
  await expect(page.getByText("Your account and vault were permanently deleted.")).toBeVisible();

  const [users, metas, items, audit] = await Promise.all([
    db.user.count({ where: { id: user.id } }),
    db.vaultMeta.count({ where: { userId: user.id } }),
    db.vaultItem.count({ where: { userId: user.id } }),
    db.auditLog.count({ where: { userId: user.id } }),
  ]);
  expect({ users, metas, items, audit }).toEqual({ users: 0, metas: 0, items: 0, audit: 0 });

  // The vault is no longer reachable and the old password doesn't sign in.
  await page.goto("/vault");
  await expect(page).toHaveURL(/\/auth\/signin/);
  await signIn(page);
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});
