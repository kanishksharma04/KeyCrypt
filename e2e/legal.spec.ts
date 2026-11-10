import { expect, test } from "@playwright/test";

// The privacy policy and terms are public, linked from the landing footer and
// from the sign-up form.

test("privacy policy and terms render signed out and are linked", async ({ page }) => {
  for (const [path, heading] of [
    ["/privacy", "Privacy policy"],
    ["/terms", "Terms of use"],
  ] as const) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${path}$`)); // not redirected to sign in
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }

  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByText("Your master password").first()).toBeVisible();

  await page.getByRole("contentinfo").getByRole("link", { name: "Terms", exact: true }).click();
  await expect(page).toHaveURL(/\/terms$/);

  await page.goto("/auth/signup");
  await expect(page.getByText("By creating an account you agree to the")).toBeVisible();
  await page.getByRole("link", { name: "Privacy Policy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
});
