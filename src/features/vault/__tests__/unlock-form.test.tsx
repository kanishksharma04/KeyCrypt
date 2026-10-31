// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  clearVaultKey,
  createVerificationBlob,
  deriveVaultKey,
  generateSalt,
  isVaultUnlocked,
  toBase64,
} from "@/lib/crypto";
import { UnlockForm } from "../unlock-form";

// Test seam: derive with 1,000 PBKDF2 iterations instead of 600,000 so the
// tests stay fast. Everything else in @/lib/crypto is real.
const TEST_ITERATIONS = 1_000;
vi.mock("@/lib/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crypto")>();
  return {
    ...actual,
    deriveVaultKey: (password: string, salt: Uint8Array<ArrayBuffer>) =>
      actual.deriveVaultKey(password, salt, TEST_ITERATIONS),
  };
});

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/components/shared/sign-out-button", () => ({ SignOutButton: () => null }));

const MASTER = "Correct-Master-Pass-1!";
let props: { salt: string; verificationBlob: string; verificationIv: string };

beforeAll(async () => {
  const salt = generateSalt();
  const key = await deriveVaultKey(MASTER, salt); // mocked: 1,000 iterations
  const blob = await createVerificationBlob(key);
  props = { salt: toBase64(salt), verificationBlob: blob.ciphertext, verificationIv: blob.iv };
});

afterEach(() => {
  cleanup();
  clearVaultKey();
  replace.mockClear();
});

async function submit(password: string) {
  const user = userEvent.setup();
  render(<UnlockForm {...props} />);
  await user.type(screen.getByLabelText("Master password"), password);
  await user.click(screen.getByRole("button", { name: "Unlock vault" }));
}

describe("UnlockForm", () => {
  it("shows the alert and stays locked on a wrong password", async () => {
    await submit("Wrong-Master-Pass-9!");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Incorrect master password. Please try again.");
    expect(isVaultUnlocked()).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it("unlocks and navigates to the vault on the right password", async () => {
    await submit(MASTER);

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/vault"));
    expect(isVaultUnlocked()).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("requires a password before trying anything", async () => {
    const user = userEvent.setup();
    render(<UnlockForm {...props} />);
    await user.click(screen.getByRole("button", { name: "Unlock vault" }));

    expect(await screen.findByText("Required")).toBeTruthy();
    expect(isVaultUnlocked()).toBe(false);
  });
});
