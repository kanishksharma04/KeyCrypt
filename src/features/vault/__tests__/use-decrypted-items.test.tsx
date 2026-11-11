// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { clearVaultKey, deriveVaultKey, generateSalt, setVaultKey } from "@/lib/crypto";
import { VaultUserProvider } from "@/providers/vault-user-provider";
import type { VaultItemRow, VaultItemType } from "@/types/vault";
import { sealItem } from "../item-payload";
import { UNREADABLE_ITEM_NAME, useDecryptedItems } from "../use-decrypted-items";
import { filterVaultItems } from "../vault-toolbar";
import { ViewItemDialog } from "../view-item-dialog";

const USER_ID = "cuser000000000000000000001";
const TYPES: VaultItemType[] = ["LOGIN", "SECURE_NOTE", "API_KEY", "WIFI_PASSWORD", "OTP_SECRET"];
const TIMES = { createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };

let key: CryptoKey;

beforeEach(async () => {
  key = await deriveVaultKey("test-master", generateSalt(), 1_000);
  setVaultKey(key);
});

afterEach(() => {
  cleanup();
  clearVaultKey();
});

/** A v2 row whose ciphertext doesn't decrypt (damaged, or written under another key). */
function unreadableRow(id: string, type: VaultItemType): VaultItemRow {
  return {
    ...TIMES,
    id,
    type,
    name: null,
    ciphertext: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    iv: "AAAAAAAAAAAAAAAA",
    favorite: false,
    folderId: null,
  };
}

async function decrypt(rows: VaultItemRow[]) {
  const { result } = renderHook(() => useDecryptedItems(rows), {
    wrapper: ({ children }) => <VaultUserProvider userId={USER_ID}>{children}</VaultUserProvider>,
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result.current.decrypted;
}

describe("useDecryptedItems", () => {
  it("gives rows that fail to decrypt an empty secret of their type", async () => {
    const items = await decrypt(TYPES.map((type, i) => unreadableRow(`c${i}`, type)));

    expect(items.map((i) => i.name)).toEqual(TYPES.map(() => UNREADABLE_ITEM_NAME));
    const login = items.find((i) => i.type === "LOGIN");
    expect(login?.secret).toEqual({
      username: "",
      password: "",
      url: "",
      notes: "",
      passwordHistory: [],
    });

    // Searching for something that doesn't match the name reads the secret fields.
    expect(filterVaultItems(items, "github", false)).toEqual([]);

    // Each one can be opened.
    for (const item of items) {
      render(<ViewItemDialog item={item} onOpenChange={() => {}} />);
      expect(screen.getByRole("heading", { name: UNREADABLE_ITEM_NAME })).toBeDefined();
      cleanup();
    }
  });

  it("fills fields missing from a payload that does decrypt", async () => {
    const id = "6f1c2a4e-8b3d-4f5a-9c7e-1d2b3a4c5e6f";
    const { ciphertext, iv } = await sealItem(
      key,
      { id, type: "LOGIN", name: "Forum", secret: { password: "pw" } },
      USER_ID
    );
    const [item] = await decrypt([
      { ...TIMES, id, type: "LOGIN", name: null, ciphertext, iv, favorite: false },
    ]);

    expect(item).toMatchObject({
      name: "Forum",
      // An older item without password history reads as an empty list.
      secret: { username: "", password: "pw", url: "", notes: "", passwordHistory: [] },
    });
    expect(filterVaultItems(item ? [item] : [], "github", false)).toEqual([]);
  });
});
