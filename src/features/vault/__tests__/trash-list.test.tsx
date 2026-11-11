// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { clearVaultKey, deriveVaultKey, generateSalt, setVaultKey } from "@/lib/crypto";
import { VaultUserProvider } from "@/providers/vault-user-provider";
import { sealItem } from "../item-payload";
import { TrashList, type TrashedItemRow } from "../trash-list";

type ItemAction = (id: string) => Promise<{ error?: string }>;
const restoreVaultItemAction = vi.fn<ItemAction>(async () => ({}));
const purgeVaultItemAction = vi.fn<ItemAction>(async () => ({}));
vi.mock("@/server/vault-item-actions", () => ({
  restoreVaultItemAction: (id: string) => restoreVaultItemAction(id),
  purgeVaultItemAction: (id: string) => purgeVaultItemAction(id),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const USER_ID = "cuser000000000000000000001";
const ID = "6f1c2a4e-8b3d-4f5a-9c7e-1d2b3a4c5e6f";
const NOW = Date.parse("2026-11-11T12:00:00Z");

let row: TrashedItemRow;

beforeEach(async () => {
  const key = await deriveVaultKey("test-master", generateSalt(), 1_000);
  setVaultKey(key);
  const { ciphertext, iv } = await sealItem(
    key,
    { id: ID, type: "LOGIN", name: "Old forum", secret: { password: "pw" } },
    USER_ID
  );
  row = {
    id: ID,
    type: "LOGIN",
    name: null,
    ciphertext,
    iv,
    favorite: false,
    folderId: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    deletedAt: new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
  };
});

afterEach(() => {
  cleanup();
  clearVaultKey();
  vi.clearAllMocks();
});

function renderTrash(items: TrashedItemRow[]) {
  return render(
    <VaultUserProvider userId={USER_ID}>
      <TrashList items={items} now={NOW} />
    </VaultUserProvider>
  );
}

describe("TrashList", () => {
  it("says when Trash is empty", () => {
    renderTrash([]);
    expect(screen.getByText("Trash is empty")).toBeDefined();
  });

  it("shows the decrypted name and how long until it's deleted forever", async () => {
    renderTrash([row]);
    expect(await screen.findByText("Old forum")).toBeDefined();
    expect(
      screen.getByText(/moved to Trash 3 days ago · deleted forever in 27 days/)
    ).toBeDefined();
  });

  it("restores an item", async () => {
    renderTrash([row]);
    await userEvent.click(await screen.findByRole("button", { name: "Restore Old forum" }));
    await waitFor(() => expect(restoreVaultItemAction).toHaveBeenCalledWith(ID));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(purgeVaultItemAction).not.toHaveBeenCalled();
  });

  it("asks before deleting forever", async () => {
    renderTrash([row]);
    await userEvent.click(await screen.findByRole("button", { name: "Delete Old forum forever" }));
    expect(purgeVaultItemAction).not.toHaveBeenCalled();

    expect(await screen.findByRole("heading", { name: "Delete forever?" })).toBeDefined();
    const confirm = screen
      .getAllByRole("button", { name: "Delete forever" })
      .find((b) => b.closest("[role='dialog']"));
    expect(confirm).toBeDefined();
    if (confirm) await userEvent.click(confirm);
    await waitFor(() => expect(purgeVaultItemAction).toHaveBeenCalledWith(ID));
  });
});
