import { expect, test, type Page } from "@playwright/test";
import { saveRecoveryKit } from "./recovery-kit";

// The installable app's read-only offline vault: after an online load, the
// encrypted vault is kept on the device; offline, /offline unlocks it with the
// master password and shows the items without editing. Signing out removes it.

const run = Date.now();
const ACCOUNT = { email: `e2e-offline-${run}@test.local`, password: "Account-Pass-123!" };
const MASTER = "Offline-Master-Pass-1!";
const LOGIN = { name: "Offline bank", username: "saver", password: "Offl1ne-Secret!" };

async function signUpWithVault(page: Page) {
  await page.goto("/auth/signup");
  await page.locator("#name").fill("Offline User");
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
}

/** The offline copy in IndexedDB, as stored (or null). */
function storedSnapshot(page: Page) {
  return page.evaluate(
    () =>
      new Promise<unknown>((resolve) => {
        const open = indexedDB.open("keycrypt-offline", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("vault");
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const get = open.result.transaction("vault").objectStore("vault").get("snapshot");
          get.onsuccess = () => {
            resolve(get.result ?? null);
            open.result.close();
          };
          get.onerror = () => resolve(null);
        };
      })
  );
}

test("installable, and the vault can be read offline from the encrypted copy", async ({
  page,
  context,
}) => {
  // Installable: a manifest with icons, and a CSP that allows the worker and manifest.
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "KeyCrypt", display: "standalone", start_url: "/vault" });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(["192x192", "512x512"]);
  const csp = (await page.request.get("/")).headers()["content-security-policy"] ?? "";
  expect(csp).toContain("worker-src 'self'");
  expect(csp).toContain("manifest-src 'self'");

  await signUpWithVault(page);
  await page.getByRole("button", { name: "New item" }).click();
  await page.getByRole("menuitem", { name: "Login" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#item-name").fill(LOGIN.name);
  await dialog.locator("#item-username").fill(LOGIN.username);
  await dialog.locator("#item-password").fill(LOGIN.password);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  // The online load leaves an encrypted copy (ciphertext only) and a cached /offline page.
  await page.reload();
  await page.locator("#masterPassword").fill(MASTER);
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await expect(page.getByText(LOGIN.name)).toBeVisible();
  await expect
    .poll(async () => ((await storedSnapshot(page)) as { items?: unknown[] } | null)?.items?.length)
    .toBe(1);
  const stored = JSON.stringify(await storedSnapshot(page));
  for (const plain of [LOGIN.name, LOGIN.username, LOGIN.password, MASTER]) {
    expect(stored).not.toContain(plain);
  }
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        return !!(await caches.match("/offline"));
      })
    )
    .toBe(true);

  // Offline: opening the vault lands on the offline copy.
  await context.setOffline(true);
  await page.goto("/vault");
  await expect(page).toHaveURL(/\/offline$/);
  await expect(page.getByRole("status").filter({ hasText: "Offline, read-only" })).toBeVisible();
  await page.locator("#masterPassword").fill("not-the-master-password");
  await page.getByRole("button", { name: "Unlock offline copy" }).click();
  await expect(page.getByText("Incorrect master password. Please try again.")).toBeVisible();
  await page.locator("#masterPassword").fill(MASTER);
  await page.getByRole("button", { name: "Unlock offline copy" }).click();

  const list = page.getByRole("list", { name: "Vault items (offline)" });
  await list.getByRole("button", { name: new RegExp(LOGIN.name) }).click();
  const details = page.getByRole("dialog");
  await expect(details.getByText(LOGIN.username)).toBeVisible();
  await details.getByRole("button", { name: "Reveal" }).first().click();
  await expect(details.getByText(LOGIN.password, { exact: true })).toBeVisible();
  // Read-only: no editing, no Trash.
  await expect(details.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(details.getByRole("button", { name: "Move to Trash" })).toHaveCount(0);

  // Back online: signing out removes the copy from the device.
  await context.setOffline(false);
  await page.goto("/vault");
  await page.locator("#masterPassword").fill(MASTER);
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/auth\/signin/);
  await expect.poll(() => storedSnapshot(page)).toBeNull();
});
