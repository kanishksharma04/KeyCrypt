// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  clearVaultKey,
  deriveVaultKey,
  encryptItem,
  generateSalt,
  setVaultKey,
} from "@/lib/crypto";
import type { LoginSecret } from "@/types/vault";
import { VaultHealthScore } from "../vault-health-score";

const getLoginItems = vi.fn();
vi.mock("@/server/settings-actions", () => ({
  getLoginItemsForHealthAction: () => getLoginItems(),
}));

const NOW = new Date().toISOString();
const TWO_YEARS_AGO = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
const STRONG_SHARED = "Same-Strong-Passw0rd!xyz";

let key: CryptoKey;

async function row(id: string, name: string, password: string, updatedAt = NOW) {
  const secret: LoginSecret = { username: "u", password, url: "", notes: "" };
  const { ciphertext, iv } = await encryptItem(key, secret);
  return { id, name, ciphertext, iv, updatedAt };
}

beforeEach(async () => {
  key = await deriveVaultKey("test-master", generateSalt(), 1_000);
  setVaultKey(key);
});

afterEach(() => {
  cleanup();
  clearVaultKey();
  getLoginItems.mockReset();
});

describe("VaultHealthScore", () => {
  it("shows weak, reused and stale counts, decrypting in the browser", async () => {
    getLoginItems.mockResolvedValue([
      await row("c1", "Forum", "abc"), // weak
      await row("c2", "Email", STRONG_SHARED), // reused
      await row("c3", "Shop", STRONG_SHARED), // reused
      await row("c4", "Old bank", "Unique-Strong-Passw0rd!42", TWO_YEARS_AGO), // stale
    ]);

    render(<VaultHealthScore />);

    expect(await screen.findByText("1 weak · 2 reused · 1 stale")).toBeTruthy();
    expect(screen.getByText("Weak password")).toBeTruthy();
    expect(screen.getAllByText("Reused password")).toHaveLength(2);
    expect(screen.getByText("Not updated in a year")).toBeTruthy();
    // Each issue links to its item.
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toEqual(
      expect.arrayContaining([
        "/vault?open=c1",
        "/vault?open=c2",
        "/vault?open=c3",
        "/vault?open=c4",
      ])
    );
  });

  it("reports a healthy vault", async () => {
    getLoginItems.mockResolvedValue([
      await row("c1", "A", "Unique-Strong-Passw0rd!1"),
      await row("c2", "B", "Another-Strong-Passw0rd!2"),
    ]);

    render(<VaultHealthScore />);

    expect(await screen.findByText("No issues found — your logins look strong.")).toBeTruthy();
    expect(screen.getByText("100")).toBeTruthy();
  });

  it("prompts to add a login when there are none", async () => {
    getLoginItems.mockResolvedValue([]);
    render(<VaultHealthScore />);
    expect(
      await screen.findByText("Add a login item to see your vault health score.")
    ).toBeTruthy();
  });

  it("renders nothing while the vault is locked", () => {
    clearVaultKey();
    const { container } = render(<VaultHealthScore />);
    expect(container.textContent).toBe("");
    expect(getLoginItems).not.toHaveBeenCalled();
  });
});
