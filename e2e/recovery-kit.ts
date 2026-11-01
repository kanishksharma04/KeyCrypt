import { expect, type Page } from "@playwright/test";

/**
 * After vault setup the recovery kit is shown once. Read the key, confirm it
 * was saved, and continue into the vault. Returns the recovery key text.
 */
export async function saveRecoveryKit(page: Page): Promise<string> {
  await expect(page.getByRole("heading", { name: "Save your recovery key" })).toBeVisible();
  const key = (await page.getByTestId("recovery-key").textContent())?.trim() ?? "";
  expect(key).toMatch(/^([A-Z2-7]{4}-){6}[A-Z2-7]{2}$/);
  const open = page.getByRole("button", { name: "Open my vault" });
  await expect(open).toBeDisabled(); // until the user confirms they saved it
  await page.getByLabel("I have saved my recovery key somewhere safe.").check();
  await open.click();
  await expect(page).toHaveURL(/\/vault$/);
  return key;
}
