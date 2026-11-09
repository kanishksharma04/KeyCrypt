import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { decryptExport } from "../src/lib/crypto";
import type { VaultExportPayload } from "../src/lib/vault-export";
import { saveRecoveryKit } from "./recovery-kit";

// Settings → Export: both formats download, and the encrypted file decrypts
// (outside the app, with only the export password) back to identical items.

const run = Date.now();
const ACCOUNT = { email: `e2e-export-${run}@test.local`, password: "Account-Pass-123!" };
const MASTER = "Export-Master-Pass-1!";
const EXPORT_PASSWORD = "Export-File-Pass-9!";

const LOGIN = {
  name: "GitHub",
  username: "octocat",
  password: 'gh-S3cret,"quoted"',
  url: "https://github.com",
};
const NOTE = { name: "Recovery codes", content: "alpha-bravo-charlie" };

async function confirmAccountPassword(page: Page, buttonName: string) {
  const dialog = page.getByRole("dialog");
  await dialog.locator("#confirm-account-password").fill(ACCOUNT.password);
  await dialog.getByRole("button", { name: buttonName }).click();
}

async function signUpAndCreateVault(page: Page) {
  await page.goto("/auth/signup");
  await page.locator("#name").fill("Export User");
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
}

async function addItem(page: Page, menuLabel: string, fields: Record<string, string>) {
  await page.getByRole("button", { name: "New item" }).click();
  await page.getByRole("menuitem", { name: menuLabel }).click();
  const dialog = page.getByRole("dialog");
  for (const [id, value] of Object.entries(fields)) await dialog.locator(`#${id}`).fill(value);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
}

test("exports the vault as encrypted JSON and as plain CSV", async ({ page }) => {
  await signUpAndCreateVault(page);
  await addItem(page, "Login", {
    "item-name": LOGIN.name,
    "item-username": LOGIN.username,
    "item-password": LOGIN.password,
    "item-url": LOGIN.url,
  });
  await addItem(page, "Secure Note", { "note-name": NOTE.name, "note-content": NOTE.content });
  await expect(page.getByText("2 items")).toBeVisible();

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/vault\/settings$/);

  // ── Encrypted JSON ─────────────────────────────────────────────────────────
  await page.locator("#export-password").fill(EXPORT_PASSWORD);
  await page.locator("#export-password-confirm").fill(EXPORT_PASSWORD);
  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByRole("button", { name: "Download encrypted export" }).click(),
  ]);
  expect(jsonDownload.suggestedFilename()).toMatch(/^keycrypt-export-\d{4}-\d{2}-\d{2}\.json$/);

  const fileText = await readFile((await jsonDownload.path())!, "utf8");
  // Nothing readable in the file itself.
  for (const s of [LOGIN.name, LOGIN.password, NOTE.content]) expect(fileText).not.toContain(s);

  const file: unknown = JSON.parse(fileText);
  expect(file).toMatchObject({
    format: "keycrypt-export",
    version: 2,
    kdf: { name: "argon2id", memoryKiB: 65_536, iterations: 3, parallelism: 1 },
  });
  await expect(decryptExport(file, "Wrong-Export-Pass-0!")).rejects.toThrow();

  const payload = await decryptExport<VaultExportPayload>(file, EXPORT_PASSWORD);
  const byName = Object.fromEntries(payload.items.map((i) => [i.name, i]));
  expect(payload.items).toHaveLength(2);
  expect(byName[LOGIN.name]).toMatchObject({
    type: "LOGIN",
    secret: { username: LOGIN.username, password: LOGIN.password, url: LOGIN.url, notes: "" },
  });
  expect(byName[NOTE.name]).toMatchObject({
    type: "SECURE_NOTE",
    secret: { content: NOTE.content },
  });

  // ── Plain CSV (behind the account-password confirmation) ───────────────────
  await page.getByRole("button", { name: "Export unencrypted CSV" }).click();
  const [csvDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    confirmAccountPassword(page, "Export CSV"),
  ]);
  expect(csvDownload.suggestedFilename()).toMatch(/\.csv$/);

  const csv = await readFile((await csvDownload.path())!, "utf8");
  const lines = csv.trimEnd().split("\r\n");
  expect(lines[0]).toBe(
    "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp"
  );
  expect(lines).toHaveLength(3);
  // The quote and comma in the password are escaped per RFC 4180.
  expect(csv).toContain(`,login,GitHub,,,0,${LOGIN.url},${LOGIN.username},"gh-S3cret,""quoted""",`);
  expect(csv).toContain(`,note,${NOTE.name},${NOTE.content},`);
});
