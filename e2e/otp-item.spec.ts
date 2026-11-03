import { expect, test, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";
import { saveRecoveryKit } from "./recovery-kit";

// Authenticator codes in the vault match a reference authenticator for the
// same secret: an OTP_SECRET item and a login with a TOTP key.

const run = Date.now();
const ACCOUNT = { email: `e2e-otp-${run}@test.local`, password: "Account-Pass-123!" };
const MASTER = "Otp-Master-Pass-1!";
const OTP_SECRET = "HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ";

/** Codes a reference authenticator shows around now (one step either side, for rollover). */
function referenceCodes(secret: string, opts: { digits?: number; algorithm?: string } = {}) {
  const totp = new TOTP({
    secret: Secret.fromBase32(secret),
    digits: opts.digits ?? 6,
    algorithm: opts.algorithm ?? "SHA1",
    period: 30,
  });
  const now = Date.now();
  return [now - 30_000, now, now + 30_000].map((timestamp) => totp.generate({ timestamp }));
}

async function shownCode(page: Page): Promise<string> {
  return ((await page.getByTestId("totp-code").textContent()) ?? "").replace(/\s/g, "");
}

test("authenticator items and login TOTP keys show the right codes", async ({ page }) => {
  await page.goto("/auth/signup");
  await page.locator("#name").fill("OTP User");
  await page.locator("#email").fill(ACCOUNT.email);
  await page.locator("#password").fill(ACCOUNT.password);
  await page.locator("#confirmPassword").fill(ACCOUNT.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/auth\/signin$/);
  await page.locator("#email").fill(ACCOUNT.email);
  await page.locator("#password").fill(ACCOUNT.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/vault\/setup$/);
  await page.locator("#masterPassword").fill(MASTER);
  await page.locator("#confirmPassword").fill(MASTER);
  await page.getByRole("button", { name: "Create vault" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#confirm-account-password").fill(ACCOUNT.password);
  await dialog.getByRole("button", { name: "Create vault" }).click();
  await saveRecoveryKit(page);

  // ── Authenticator item from a base32 key (typed loosely) ───────────────────
  await page.getByRole("button", { name: "New item" }).click();
  await page.getByRole("menuitem", { name: "Authenticator" }).click();
  let d = page.getByRole("dialog");
  await d.locator("#otp-name").fill("Bank 2FA");
  await d.locator("#otp-secret").fill("bad key!");
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d.getByText("Enter a base32 key or an otpauth:// link")).toBeVisible();
  await d.locator("#otp-secret").fill(OTP_SECRET.toLowerCase().replace(/(.{4})/g, "$1 "));
  await d.locator("#otp-issuer").fill("Bank");
  await d.locator("#otp-account").fill("jo@example.test");
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d).toBeHidden();
  await expect(page.getByText("Bank · jo@example.test")).toBeVisible();

  await page.getByTitle("View item").filter({ hasText: "Bank 2FA" }).click();
  d = page.getByRole("dialog");
  await expect(d.getByRole("timer")).toBeVisible();
  expect(referenceCodes(OTP_SECRET)).toContain(await shownCode(page));
  // Copy puts the current code on the clipboard (via copySecret).
  await d.getByRole("button", { name: "Copy code" }).click();
  expect(referenceCodes(OTP_SECRET)).toContain(
    await page.evaluate(() => navigator.clipboard.readText())
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // ── Login with an otpauth:// link (8 digits, SHA-256) ──────────────────────
  await page.getByRole("button", { name: "New item" }).click();
  await page.getByRole("menuitem", { name: "Login" }).click();
  d = page.getByRole("dialog");
  await d.locator("#item-name").fill("GitLab");
  await d.locator("#item-username").fill("dev");
  await d.locator("#item-password").fill("Gitlab-Pw-1!");
  await d
    .locator("#item-totp")
    .fill(
      "otpauth://totp/GitLab:dev?secret=JBSWY3DPEHPK3PXP&issuer=GitLab&digits=8&algorithm=SHA256"
    );
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d).toBeHidden();
  await page.getByTitle("View item").filter({ hasText: "GitLab" }).click();
  await expect(page.getByTestId("totp-code")).toBeVisible();
  expect(referenceCodes("JBSWY3DPEHPK3PXP", { digits: 8, algorithm: "SHA256" })).toContain(
    await shownCode(page)
  );
});
