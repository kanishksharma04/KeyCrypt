// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { clearVaultKey, deriveVaultKey, generateSalt, setVaultKey } from "@/lib/crypto";
import { VaultUserProvider } from "@/providers/vault-user-provider";
import type { DecryptedLoginItem, LoginSecret } from "@/types/vault";
import { openItem } from "../item-payload";
import { LoginItemDialog } from "../login-item-dialog";
import { ViewItemDialog } from "../view-item-dialog";

type UpdateInput = { id: string; ciphertext: string; iv: string };
const updateVaultItemAction = vi.fn<(input: UpdateInput) => Promise<{ error?: string }>>(
  async () => ({})
);
vi.mock("@/server/vault-item-actions", () => ({
  createVaultItemAction: vi.fn(),
  updateVaultItemAction: (input: UpdateInput) => updateVaultItemAction(input),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const USER_ID = "cuser000000000000000000001";
// The panel shows times in the viewer's time zone.
const shown = (iso: string) =>
  `Used until ${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))}`;
const ID = "6f1c2a4e-8b3d-4f5a-9c7e-1d2b3a4c5e6f";
const HISTORY = [
  { password: "second-old-pw", changedAt: "2026-11-01T09:30:00.000Z" },
  { password: "first-old-pw", changedAt: "2026-06-15T18:05:00.000Z" },
];

let key: CryptoKey;

beforeEach(async () => {
  key = await deriveVaultKey("test-master", generateSalt(), 1_000);
  setVaultKey(key);
});

afterEach(() => {
  cleanup();
  clearVaultKey();
  vi.clearAllMocks();
});

function login(secret: Partial<LoginSecret>): DecryptedLoginItem {
  return {
    id: ID,
    type: "LOGIN",
    name: "Forum",
    favorite: false,
    folderId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-11-01T09:30:00.000Z",
    secret: { username: "me", password: "current-pw", url: "", notes: "", ...secret },
  };
}

describe("Password history in the details panel", () => {
  it("lists earlier passwords, hidden until revealed, each with its own copy button", async () => {
    render(<ViewItemDialog item={login({ passwordHistory: HISTORY })} onOpenChange={() => {}} />);
    const section = screen.getByRole("region", { name: "Password history" });
    expect(within(section).getByText(shown("2026-11-01T09:30:00.000Z"))).toBeDefined();
    expect(within(section).getByText(shown("2026-06-15T18:05:00.000Z"))).toBeDefined();
    expect(within(section).queryByText("second-old-pw")).toBeNull();

    const reveal = within(section).getAllByRole("button", { name: "Reveal" });
    expect(reveal).toHaveLength(2);
    const [newest] = reveal;
    if (!newest) throw new Error("no reveal button");
    await userEvent.click(newest);
    expect(within(section).getByText("second-old-pw")).toBeDefined();
    expect(within(section).queryByText("first-old-pw")).toBeNull();
    expect(within(section).getAllByRole("button", { name: /copy/i })).toHaveLength(2);
  });

  it("shows no section for a login without history", () => {
    render(<ViewItemDialog item={login({})} onOpenChange={() => {}} />);
    expect(screen.queryByRole("region", { name: "Password history" })).toBeNull();
  });
});

describe("Editing a login", () => {
  async function editPassword(newPassword: string) {
    render(
      <VaultUserProvider userId={USER_ID}>
        <LoginItemDialog
          open
          onOpenChange={() => {}}
          mode="edit"
          itemId={ID}
          initialValues={{
            name: "Forum",
            username: "me",
            password: "current-pw",
            url: "",
            notes: "",
          }}
          passwordHistory={HISTORY}
        />
      </VaultUserProvider>
    );
    const field = screen.getByLabelText("Password");
    await userEvent.clear(field);
    await userEvent.type(field, newPassword);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateVaultItemAction).toHaveBeenCalledTimes(1));
    const call = updateVaultItemAction.mock.calls[0]?.[0];
    if (!call) throw new Error("no update");
    const opened = await openItem<LoginSecret>(
      key,
      { ...call, type: "LOGIN", name: null },
      USER_ID
    );
    return opened.secret;
  }

  it("keeps the old password, newest first, inside the encrypted secret", async () => {
    const secret = await editPassword("brand-new-pw");
    expect(secret.password).toBe("brand-new-pw");
    expect(secret.passwordHistory?.map((e) => e.password)).toEqual([
      "current-pw",
      "second-old-pw",
      "first-old-pw",
    ]);
    expect(Date.parse(secret.passwordHistory?.[0]?.changedAt ?? "")).toBeGreaterThan(
      Date.parse("2026-01-01")
    );
  });

  it("doesn't add an entry when the password is unchanged", async () => {
    const secret = await editPassword("current-pw");
    expect(secret.passwordHistory).toEqual(HISTORY);
  });
});
