import { expect, test, type Page } from "@playwright/test";
import { saveRecoveryKit } from "./recovery-kit";

// A user who forgets the master password unlocks with the recovery key saved
// at setup, sets a new master password, and keeps every item.

const run = Date.now();
const ACCOUNT = { email: `e2e-recovery-${run}@test.local`, password: "Account-Pass-123!" };
const FORGOTTEN = "Forgotten-Master-Pass-1!";
const NEW_MASTER = "Recovered-Master-Pass-2!";
const NOTE = { name: "Recovery codes", content: "alpha-bravo-charlie" };

async function confirmAccountPassword(page: Page, buttonName: string) {
  const dialog = page.getByRole("dialog");
  await dialog.locator("#confirm-account-password").fill(ACCOUNT.password);
  await dialog.getByRole("button", { name: buttonName }).click();
}

async function unlockWith(page: Page, masterPassword: string) {
  await expect(page).toHaveURL(/\/vault\/unlock$/);
  await page.locator("#masterPassword").fill(masterPassword);
  await page.getByRole("button", { name: "Unlock vault" }).click();
}

test("forgot master password: unlock with the recovery key and set a new one", async ({ page }) => {
  // Sign up, create the vault, save the recovery kit.
  await page.goto("/auth/signup");
  await page.locator("#name").fill("Recovery User");
  await page.locator("#email").fill(ACCOUNT.email);
  await page.locator("#password").fill(ACCOUNT.password);
  await page.locator("#confirmPassword").fill(ACCOUNT.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/auth\/signin$/);
  await page.locator("#email").fill(ACCOUNT.email);
  await page.locator("#password").fill(ACCOUNT.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/vault\/setup$/);
  await page.locator("#masterPassword").fill(FORGOTTEN);
  await page.locator("#confirmPassword").fill(FORGOTTEN);
  await page.getByRole("button", { name: "Create vault" }).click();
  await confirmAccountPassword(page, "Create vault");
  const recoveryKey = await saveRecoveryKit(page);

  // One item, then lock.
  await page.getByRole("button", { name: "New item" }).click();
  await page.getByRole("menuitem", { name: "Secure Note" }).click();
  const d = page.getByRole("dialog");
  await d.locator("#note-name").fill(NOTE.name);
  await d.locator("#note-content").fill(NOTE.content);
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d).toBeHidden();
  await page.getByRole("button", { name: "Lock vault" }).click();

  // "Forgot your master password?" → recovery key (typed loosely) → new password.
  await expect(page).toHaveURL(/\/vault\/unlock$/);
  await page.getByRole("button", { name: "Use recovery key" }).click();
  await page.locator("#recovery-key").fill("AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That recovery key doesn't unlock this vault.")).toBeVisible();
  await page.locator("#recovery-key").fill(recoveryKey.toLowerCase().replace(/-/g, " "));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByText("Recovery key accepted. Choose a new master password.")
  ).toBeVisible();
  await page.locator("#newMasterPassword").fill(NEW_MASTER);
  await page.locator("#confirmNewMasterPassword").fill(NEW_MASTER);
  await page.getByRole("button", { name: "Set new master password" }).click();
  await confirmAccountPassword(page, "Set new master password");
  await expect(page).toHaveURL(/\/vault$/, { timeout: 60_000 });
  await expect(page.getByText("1 item")).toBeVisible();

  // The item survived, and from now on the NEW master password unlocks the vault.
  await page.getByRole("button", { name: "Lock vault" }).click();
  await unlockWith(page, FORGOTTEN);
  await expect(page.getByText("Incorrect master password. Please try again.")).toBeVisible();
  await page.locator("#masterPassword").fill(NEW_MASTER);
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await expect(page).toHaveURL(/\/vault$/);
  await page.getByTitle("View item").filter({ hasText: NOTE.name }).click();
  await expect(page.getByRole("dialog").getByText(NOTE.content, { exact: true })).toBeVisible();
});
