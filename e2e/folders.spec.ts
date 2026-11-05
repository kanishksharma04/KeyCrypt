import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { saveRecoveryKit } from "./recovery-kit";

// Folders end to end: create, file items, filter, rename, find through the
// command palette, delete. Folder names never reach the server in plain text.

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });
test.afterAll(() => db.$disconnect());

const run = Date.now();
const ACCOUNT = { email: `e2e-folders-${run}@test.local`, password: "Account-Pass-123!" };
const MASTER = "Folder-Master-Pass-1!";

async function addNote(page: Page, name: string) {
  await page.getByRole("button", { name: "New item" }).click();
  await page.getByRole("menuitem", { name: "Secure Note" }).click();
  const d = page.getByRole("dialog");
  await d.locator("#note-name").fill(name);
  await d.locator("#note-content").fill(`${name} content`);
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d).toBeHidden();
}

const row = (page: Page, name: string) =>
  page.getByTitle("View item").filter({ has: page.getByText(name, { exact: true }) });

test("folders: create, move, filter, rename, palette, delete", async ({ page }) => {
  const posted: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posted.push(r.postData() ?? "");
  });

  await page.goto("/auth/signup");
  await page.locator("#name").fill("Folder User");
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
  const confirm = page.getByRole("dialog");
  await confirm.locator("#confirm-account-password").fill(ACCOUNT.password);
  await confirm.getByRole("button", { name: "Create vault" }).click();
  await saveRecoveryKit(page);

  await addNote(page, "Payroll notes");
  await addNote(page, "Gym locker");

  // ── Create two folders ─────────────────────────────────────────────────────
  await page.getByRole("button", { name: "New item" }).click();
  await page.getByRole("menuitem", { name: "Manage folders…" }).click();
  let d = page.getByRole("dialog");
  for (const name of ["Workplace Zeta", "Personal Omega"]) {
    await d.getByRole("textbox", { name: "New folder name" }).fill(name);
    await d.getByRole("button", { name: "Add" }).click();
    await expect(d.getByRole("list", { name: "Folders" }).getByText(name)).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // ── Move an item into a folder ─────────────────────────────────────────────
  await page
    .locator("div")
    .filter({ has: row(page, "Payroll notes") })
    .last()
    .getByRole("button", { name: "More actions" })
    .click();
  await page.getByRole("menuitem", { name: "Move to folder…" }).click();
  d = page.getByRole("dialog");
  await d.getByLabel("Folder").selectOption({ label: "Workplace Zeta" });
  await d.getByRole("button", { name: "Move" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row(page, "Payroll notes").getByText("Workplace Zeta")).toBeVisible();

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filter = page.getByLabel("Folder filter");
  await filter.selectOption({ label: "Workplace Zeta" });
  await expect(row(page, "Payroll notes")).toBeVisible();
  await expect(row(page, "Gym locker")).toHaveCount(0);
  await filter.selectOption({ label: "No folder" });
  await expect(row(page, "Gym locker")).toBeVisible();
  await expect(row(page, "Payroll notes")).toHaveCount(0);
  await filter.selectOption({ label: "Personal Omega" });
  await expect(page.getByText("No items in this folder")).toBeVisible();
  await filter.selectOption({ label: "All folders" });

  // ── Rename ─────────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "New item" }).click();
  await page.getByRole("menuitem", { name: "Manage folders…" }).click();
  d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Rename Workplace Zeta" }).click();
  await d.getByRole("textbox", { name: "New name for Workplace Zeta" }).fill("Office Kappa");
  await d.getByRole("button", { name: "Save name" }).click();
  await expect(d.getByRole("list", { name: "Folders" }).getByText("Office Kappa")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(row(page, "Payroll notes").getByText("Office Kappa")).toBeVisible();

  // ── Command palette: folder search and "Show folder" ───────────────────────
  await page
    .getByRole("button", { name: /Search/ })
    .first()
    .click();
  const palette = page.getByPlaceholder("Search items or run a command…");
  await palette.fill("Office Kappa");
  await expect(page.getByRole("option", { name: /Payroll notes/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Gym locker/ })).toHaveCount(0);
  await page.getByRole("option", { name: "Show folder: Office Kappa" }).click();
  await expect(page).toHaveURL(/\/vault\?folder=[0-9a-f-]{36}$/);
  await expect(row(page, "Payroll notes")).toBeVisible();
  await expect(row(page, "Gym locker")).toHaveCount(0);

  // ── Delete the folder: its item stays, unfiled ─────────────────────────────
  await page.getByRole("button", { name: "New item" }).click();
  await page.getByRole("menuitem", { name: "Manage folders…" }).click();
  d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Delete Office Kappa" }).click();
  await d.getByRole("button", { name: "Delete Office Kappa" }).click();
  await expect(d.getByText("Office Kappa")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByLabel("Folder filter").selectOption({ label: "All folders" });
  await expect(row(page, "Payroll notes")).toBeVisible();
  await expect(row(page, "Payroll notes").getByText("Office Kappa")).toHaveCount(0);

  // ── The server never saw a folder name ─────────────────────────────────────
  const user = await db.user.findUniqueOrThrow({ where: { email: ACCOUNT.email } });
  const folders = await db.folder.findMany({ where: { userId: user.id } });
  expect(folders).toHaveLength(1); // Personal Omega
  const everything = JSON.stringify([posted, folders]);
  for (const name of ["Workplace Zeta", "Personal Omega", "Office Kappa"]) {
    expect(everything).not.toContain(name);
  }
});
