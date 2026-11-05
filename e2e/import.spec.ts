import { resolve } from "path";
import { expect, test, type Page } from "@playwright/test";
import { saveRecoveryKit } from "./recovery-kit";

// Settings → Import: files are parsed and encrypted in the browser, previewed,
// then saved in batches. The imported items decrypt in the vault list.

const FIXTURES = resolve(__dirname, "../src/features/vault/import/__tests__/fixtures");
const run = Date.now();
const ACCOUNT = { email: `e2e-import-${run}@test.local`, password: "Account-Pass-123!" };
const MASTER = "Import-Master-Pass-1!";

async function confirmAccountPassword(page: Page, buttonName: string) {
  const dialog = page.getByRole("dialog");
  await dialog.locator("#confirm-account-password").fill(ACCOUNT.password);
  await dialog.getByRole("button", { name: buttonName }).click();
}

test("imports Chrome CSV and a KeyCrypt export, and every item decrypts", async ({ page }) => {
  await page.goto("/auth/signup");
  await page.locator("#name").fill("Import User");
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
  await confirmAccountPassword(page, "Create vault");
  await saveRecoveryKit(page);

  // ── Chrome CSV: format detected, preview with a skipped row ────────────────
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/vault\/settings$/);
  await page.locator("#import-file").setInputFiles(resolve(FIXTURES, "chrome.csv"));
  await expect(page.locator("#import-format")).toHaveValue("chrome-csv");
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText("Ready to import 2 items: 2 logins.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Skipped rows" })).toHaveText("Row 3: No password");
  const saved: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") saved.push(r.postData() ?? "");
  });
  await page.getByRole("button", { name: "Import 2 items" }).click();
  await expect(page.getByText("Imported 2 items.")).toBeVisible();
  // Nothing in plain text was posted.
  expect(saved.join("\n")).not.toContain("G00gle-pw");
  expect(saved.join("\n")).not.toContain("accounts.google.com");

  // ── KeyCrypt encrypted export: needs its export password ───────────────────
  await page.locator("#import-file").setInputFiles(resolve(FIXTURES, "keycrypt-export.json"));
  await expect(page.locator("#import-format")).toHaveValue("keycrypt-export");
  await page.locator("#import-export-password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText("Wrong export password, or the file is damaged.")).toBeVisible();
  await page.locator("#import-export-password").fill("fixture-export-password");
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(
    page.getByText("Ready to import 4 items: 1 login, 1 secure note, 1 API key, 1 Wi-Fi password.")
  ).toBeVisible();
  await page.getByRole("button", { name: "Import 4 items" }).click();
  await expect(page.getByText("Imported 4 items.")).toBeVisible();

  // ── The vault lists and decrypts all six ───────────────────────────────────
  await page.getByRole("link", { name: "Vault", exact: true }).click();
  await expect(page.getByText("6 items")).toBeVisible();
  for (const name of [
    "accounts.google.com",
    "example.test",
    "GitHub",
    "Recovery codes",
    "OpenWeather",
    "Home WiFi",
  ]) {
    await expect(
      page.getByTitle("View item").filter({ has: page.getByText(name, { exact: true }) })
    ).toBeVisible();
  }
  await page
    .getByTitle("View item")
    .filter({ has: page.getByText("example.test", { exact: true }) })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("jane", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Reveal" }).click();
  await expect(dialog.getByText("pw,with,commas", { exact: true })).toBeVisible();
});
