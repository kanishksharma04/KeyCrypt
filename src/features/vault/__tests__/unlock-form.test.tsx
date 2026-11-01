// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  clearVaultKey,
  createVerificationBlob,
  decryptItem,
  deriveVaultKey,
  encryptItem,
  generateSalt,
  getVaultKey,
  isVaultUnlocked,
  toBase64,
} from "@/lib/crypto";
import type { VaultMetaForUnlock } from "@/server/vault-actions";
import { UnlockForm } from "../unlock-form";
import { createVaultKeys } from "../vault-crypto";

// Test seam: 1,000 PBKDF2 iterations instead of 600,000 for both the v1 vault
// key and the v2 key-encryption key. Everything else in @/lib/crypto is real.
const TEST_ITERATIONS = 1_000;
vi.mock("@/lib/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crypto")>();
  const { FAST_TEST_KDF } = await import("@/test/fast-kdf");
  return {
    ...actual,
    deriveVaultKey: (password: string, salt: Uint8Array<ArrayBuffer>) =>
      actual.deriveVaultKey(password, salt, TEST_ITERATIONS),
    deriveKek: (password: string, salt: Uint8Array<ArrayBuffer>) =>
      actual.deriveKek(password, salt, FAST_TEST_KDF),
  };
});

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/components/shared/sign-out-button", () => ({ SignOutButton: () => null }));

// Server actions used by the upgrade path (all receive ciphertext only).
const server = vi.hoisted(() => ({
  getVaultMeta: vi.fn(),
  upgradeVault: vi.fn(),
  getAllItems: vi.fn(),
  confirmAccountPassword: vi.fn(),
}));
vi.mock("@/server/vault-actions", () => ({
  getVaultMetaAction: () => server.getVaultMeta(),
  upgradeVaultAction: (input: unknown) => server.upgradeVault(input),
}));
vi.mock("@/server/settings-actions", () => ({
  getAllItemsForReEncryptionAction: () => server.getAllItems(),
}));
vi.mock("@/server/reauth-actions", () => ({
  confirmAccountPasswordAction: (pw: string) => server.confirmAccountPassword(pw),
}));

const MASTER = "Correct-Master-Pass-1!";
let v2Meta: VaultMetaForUnlock;
let v1Meta: VaultMetaForUnlock;
let v1Key: CryptoKey;

beforeAll(async () => {
  const { setup } = await createVaultKeys(MASTER);
  v2Meta = { cryptoVersion: 2, ...setup };

  const salt = generateSalt();
  v1Key = await deriveVaultKey(MASTER, salt); // mocked: 1,000 iterations
  const blob = await createVerificationBlob(v1Key);
  v1Meta = {
    cryptoVersion: 1,
    kdf: "pbkdf2",
    kdfParams: null,
    salt: toBase64(salt),
    verificationBlob: blob.ciphertext,
    verificationIv: blob.iv,
    wrappedVaultKey: null,
    wrapIv: null,
  };
});

beforeEach(() => {
  server.confirmAccountPassword.mockResolvedValue({});
  server.upgradeVault.mockResolvedValue({});
  server.getVaultMeta.mockResolvedValue(v1Meta);
});

afterEach(() => {
  cleanup();
  clearVaultKey();
  replace.mockClear();
  vi.clearAllMocks();
});

async function submit(meta: VaultMetaForUnlock, password: string) {
  const user = userEvent.setup();
  render(<UnlockForm meta={meta} />);
  await user.type(screen.getByLabelText("Master password"), password);
  await user.click(screen.getByRole("button", { name: "Unlock vault" }));
  return user;
}

describe("UnlockForm (v2 vault)", () => {
  it("shows the alert and stays locked on a wrong password", async () => {
    await submit(v2Meta, "Wrong-Master-Pass-9!");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Incorrect master password. Please try again.");
    expect(isVaultUnlocked()).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it("unwraps the vault key and navigates on the right password", async () => {
    await submit(v2Meta, MASTER);

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/vault"));
    expect(getVaultKey()?.extractable).toBe(false);
    expect(server.upgradeVault).not.toHaveBeenCalled();
  });

  it("requires a password before trying anything", async () => {
    const user = userEvent.setup();
    render(<UnlockForm meta={v2Meta} />);
    await user.click(screen.getByRole("button", { name: "Unlock vault" }));

    expect(await screen.findByText("Required")).toBeTruthy();
    expect(isVaultUnlocked()).toBe(false);
  });
});

describe("UnlockForm (v1 vault)", () => {
  it("upgrades to v2 after the account password is confirmed", async () => {
    const item = await encryptItem(v1Key, { password: "old-secret" });
    server.getAllItems.mockResolvedValue([{ id: "citem00000000000000000001", ...item }]);

    const user = await submit(v1Meta, MASTER);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("One-time security upgrade");
    await user.type(screen.getByLabelText("Account password"), "Account-Pass-1!");
    await user.click(screen.getByRole("button", { name: "Upgrade and unlock" }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/vault"));
    const [input] = server.upgradeVault.mock.calls[0] as [Record<string, unknown>];
    expect(input).toMatchObject({
      currentVerificationBlob: v1Meta.verificationBlob,
      currentVerificationIv: v1Meta.verificationIv,
    });
    expect(String(input.wrappedVaultKey)).toHaveLength(64);

    // The item was re-encrypted under the NEW vault key now in memory.
    const [reencrypted] = input.items as { ciphertext: string; iv: string }[];
    const key = getVaultKey()!;
    expect(await decryptItem(key, reencrypted!)).toEqual({ password: "old-secret" });
    await expect(decryptItem(v1Key, reencrypted!)).rejects.toThrow();
    expect(JSON.stringify(input)).not.toContain("old-secret");
    expect(JSON.stringify(input)).not.toContain(MASTER);
  });

  it("stays locked if the upgrade is cancelled", async () => {
    server.getAllItems.mockResolvedValue([]);
    const user = await submit(v1Meta, MASTER);
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      await screen.findByText("Your vault needs a one-time upgrade before it can be opened.")
    ).toBeTruthy();
    expect(isVaultUnlocked()).toBe(false);
    expect(server.upgradeVault).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
