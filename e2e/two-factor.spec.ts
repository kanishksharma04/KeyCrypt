import { expect, test, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";
import { saveRecoveryKit } from "./recovery-kit";

// Turn on two-factor sign-in from Settings, sign in again with a code from the
// authenticator, then turn it off.

const run = Date.now();
const ACCOUNT = { email: `e2e-totp-${run}@test.local`, password: "Account-Pass-123!" };
const MASTER = "Two-Factor-Master-1!";

/** What the user's authenticator app would show for this secret. */
function authenticatorCode(secret: string): string {
  return new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
}

async function confirmAccountPassword(page: Page, buttonName: string) {
  const dialog = page.getByRole("dialog");
  await dialog.locator("#confirm-account-password").fill(ACCOUNT.password);
  await dialog.getByRole("button", { name: buttonName }).click();
}

async function signInWithPassword(page: Page) {
  await page.locator("#email").fill(ACCOUNT.email);
  await page.locator("#password").fill(ACCOUNT.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("turn on two-factor sign-in, sign in with a code, turn it off", async ({ page }) => {
  // Sign up, create the vault.
  await page.goto("/auth/signup");
  await page.locator("#name").fill("Two-Factor User");
  await page.locator("#email").fill(ACCOUNT.email);
  await page.locator("#password").fill(ACCOUNT.password);
  await page.locator("#confirmPassword").fill(ACCOUNT.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/auth\/signin$/);
  await signInWithPassword(page);
  await expect(page).toHaveURL(/\/vault\/setup$/);
  await page.locator("#masterPassword").fill(MASTER);
  await page.locator("#confirmPassword").fill(MASTER);
  await page.getByRole("button", { name: "Create vault" }).click();
  await confirmAccountPassword(page, "Create vault");
  await saveRecoveryKit(page);

  // Settings → turn on: password, QR code, one code, backup codes.
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/vault\/settings$/);
  await expect(page.getByText("Two-factor sign-in is off.")).toBeVisible();
  await page.getByRole("button", { name: "Turn on two-factor sign-in" }).click();
  await confirmAccountPassword(page, "Continue");
  await expect(page.getByAltText("QR code for your authenticator app")).toHaveAttribute(
    "src",
    /^data:image\/png;base64,/
  );
  const secret = (await page.getByTestId("totp-secret").textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);

  await page.locator("#totp-setup-code").fill(authenticatorCode(secret));
  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  const codes = page.getByRole("list", { name: "Backup codes" }).getByRole("listitem");
  await expect(codes).toHaveCount(10);
  const backupCode = (await codes.first().textContent())?.trim() ?? "";
  expect(backupCode).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
  const done = page.getByRole("button", { name: "Done" });
  await expect(done).toBeDisabled();
  await page.getByLabel("I have saved my backup codes.").check();
  await done.click();
  await expect(page.getByText("10 backup codes left.")).toBeVisible();

  // Sign out (drop the session cookie) and sign in again: a code is now required.
  await page.context().clearCookies();
  await page.goto("/auth/signin");
  await signInWithPassword(page);
  await expect(page.locator("#totp")).toBeVisible();
  await page.locator("#totp").fill("000000" === authenticatorCode(secret) ? "111111" : "000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("That code didn't work.", { exact: false })).toBeVisible();
  await page.locator("#totp").fill(authenticatorCode(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/vault\/unlock$/);

  // A backup code works too (once).
  await page.context().clearCookies();
  await page.goto("/auth/signin");
  await signInWithPassword(page);
  await page.locator("#totp").fill(backupCode);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/vault\/unlock$/);

  // Turn it off: code + account password.
  await page.locator("#masterPassword").fill(MASTER);
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await expect(page).toHaveURL(/\/vault$/);
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByText("9 backup codes left.")).toBeVisible();
  await page.getByRole("button", { name: "Turn off two-factor sign-in" }).click();
  await page.locator("#totp-disable-code").fill(authenticatorCode(secret));
  await page.getByRole("button", { name: "Turn off", exact: true }).click();
  await confirmAccountPassword(page, "Turn off");
  await expect(page.getByText("Two-factor sign-in is off.")).toBeVisible();

  // Password alone signs in again.
  await page.context().clearCookies();
  await page.goto("/auth/signin");
  await signInWithPassword(page);
  await expect(page).toHaveURL(/\/vault\/unlock$/);
});
