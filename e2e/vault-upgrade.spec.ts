import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import {
  createVerificationBlob,
  deriveVaultKey,
  encryptItem,
  generateSalt,
  toBase64,
} from "../src/lib/crypto";
import { hashPassword } from "../src/lib/password";

// A vault created before crypto v2 (vaultKey = PBKDF2(master, salt)) is
// upgraded on its first unlock and keeps every item.

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });
test.afterAll(() => db.$disconnect());

const run = Date.now();
const ACCOUNT = { email: `e2e-v1-${run}@test.local`, password: "Account-Pass-123!" };
const MASTER = "Legacy-Master-Pass-1!";
const LOGIN = {
  name: "GitHub",
  username: "octocat",
  password: "v1-S3cret-Pa55!",
  url: "https://github.com",
  notes: "",
};
const NOTE = { name: "Recovery codes", content: "alpha-bravo-charlie" };

/** Insert a user with a v1 vault and two v1-encrypted items, exactly as the old app stored them. */
async function seedV1Vault() {
  const user = await db.user.create({
    data: {
      email: ACCOUNT.email,
      name: "Legacy User",
      emailVerified: new Date(),
      passwordHash: await hashPassword(ACCOUNT.password),
    },
  });
  const salt = generateSalt();
  const v1Key = await deriveVaultKey(MASTER, salt);
  const verifier = await createVerificationBlob(v1Key);
  await db.vaultMeta.create({
    data: {
      userId: user.id,
      cryptoVersion: 1,
      salt: toBase64(salt),
      verificationBlob: verifier.ciphertext,
      verificationIv: verifier.iv,
    },
  });
  const { name: loginName, ...loginSecret } = LOGIN;
  const login = await encryptItem(v1Key, loginSecret);
  const note = await encryptItem(v1Key, { content: NOTE.content });
  await db.vaultItem.createMany({
    data: [
      { userId: user.id, type: "LOGIN", name: loginName, ...login },
      { userId: user.id, type: "SECURE_NOTE", name: NOTE.name, ...note },
    ],
  });
  return user.id;
}

async function unlock(page: Page) {
  await expect(page).toHaveURL(/\/vault\/unlock$/);
  await page.locator("#masterPassword").fill(MASTER);
  await page.getByRole("button", { name: "Unlock vault" }).click();
}

async function expectItemsIntact(page: Page) {
  await expect(page.getByText("2 items")).toBeVisible();

  await page.getByTitle("View item").filter({ hasText: LOGIN.name }).click();
  let d = page.getByRole("dialog");
  await expect(d.getByText(LOGIN.username)).toBeVisible();
  await d.getByRole("button", { name: "Reveal" }).click();
  await expect(d.getByText(LOGIN.password, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(d).toBeHidden();

  await page.getByTitle("View item").filter({ hasText: NOTE.name }).click();
  d = page.getByRole("dialog");
  await expect(d.getByText(NOTE.content, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(d).toBeHidden();
}

test("a v1 vault is upgraded to v2 on unlock and keeps every item", async ({ page }) => {
  const userId = await seedV1Vault();
  const itemsBefore = await db.vaultItem.findMany({ where: { userId }, orderBy: { id: "asc" } });

  await page.goto("/auth/signin");
  await page.locator("#email").fill(ACCOUNT.email);
  await page.locator("#password").fill(ACCOUNT.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // First unlock: v1 → one-time upgrade, confirmed with the account password.
  await unlock(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("One-time security upgrade")).toBeVisible();
  await dialog.locator("#confirm-account-password").fill(ACCOUNT.password);
  await dialog.getByRole("button", { name: "Upgrade and unlock" }).click();
  await expect(page).toHaveURL(/\/vault$/, { timeout: 60_000 });
  await expectItemsIntact(page);

  // The database now holds a v2 vault with every item re-encrypted.
  const meta = await db.vaultMeta.findUniqueOrThrow({ where: { userId } });
  expect(meta.cryptoVersion).toBe(2);
  expect(meta.wrappedVaultKey).toHaveLength(64);
  expect(meta.wrapIv).toBeTruthy();
  const itemsAfter = await db.vaultItem.findMany({ where: { userId }, orderBy: { id: "asc" } });
  expect(itemsAfter.map((i) => i.id)).toEqual(itemsBefore.map((i) => i.id));
  itemsAfter.forEach((item, i) => expect(item.ciphertext).not.toBe(itemsBefore[i]!.ciphertext));

  // Next unlock takes the v2 path: no upgrade prompt, same master password.
  await page.reload();
  await unlock(page);
  await expect(page).toHaveURL(/\/vault$/);
  await expectItemsIntact(page);
});
