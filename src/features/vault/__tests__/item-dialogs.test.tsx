// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  clearVaultKey,
  decryptItem,
  deriveVaultKey,
  generateSalt,
  setVaultKey,
} from "@/lib/crypto";
import { LoginItemDialog } from "../login-item-dialog";
import { SecureNoteDialog } from "../secure-note-dialog";
import { ApiKeyDialog } from "../api-key-dialog";
import { WifiPasswordDialog } from "../wifi-password-dialog";

const createVaultItemAction = vi.fn();
vi.mock("@/server/vault-item-actions", () => ({
  createVaultItemAction: (...args: unknown[]) => createVaultItemAction(...args),
  updateVaultItemAction: vi.fn(),
}));

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
}

interface Case {
  type: string;
  Dialog: ComponentType<DialogProps>;
  nameField: string;
  name: string;
  /** Field id → value typed into it. */
  fields: Record<string, string>;
  /** What the encrypted payload must decrypt to. */
  secret: Record<string, string>;
  /** Plaintext values that must never appear in the action's arguments. */
  sensitive: string[];
}

const CASES: Case[] = [
  {
    type: "LOGIN",
    Dialog: LoginItemDialog,
    nameField: "item-name",
    name: "GitHub",
    fields: {
      "item-username": "octocat-user",
      "item-password": "Pl41ntext-L0gin-Secret!",
      "item-url": "https://github.example/login",
      "item-notes": "login-notes-secret",
    },
    secret: {
      username: "octocat-user",
      password: "Pl41ntext-L0gin-Secret!",
      url: "https://github.example/login",
      notes: "login-notes-secret",
    },
    sensitive: ["Pl41ntext-L0gin-Secret!", "octocat-user", "login-notes-secret"],
  },
  {
    type: "SECURE_NOTE",
    Dialog: SecureNoteDialog,
    nameField: "note-name",
    name: "Recovery codes",
    fields: { "note-content": "pl41ntext-recovery-code-777" },
    secret: { content: "pl41ntext-recovery-code-777" },
    sensitive: ["pl41ntext-recovery-code-777"],
  },
  {
    type: "API_KEY",
    Dialog: ApiKeyDialog,
    nameField: "ak-name",
    name: "Stripe",
    fields: {
      "ak-key": "sk_live_pl41ntext_api_key",
      "ak-description": "billing-desc-secret",
      "ak-notes": "api-notes-secret",
    },
    secret: {
      key: "sk_live_pl41ntext_api_key",
      description: "billing-desc-secret",
      notes: "api-notes-secret",
    },
    sensitive: ["sk_live_pl41ntext_api_key", "billing-desc-secret", "api-notes-secret"],
  },
  {
    type: "WIFI_PASSWORD",
    Dialog: WifiPasswordDialog,
    nameField: "wifi-name",
    name: "Home WiFi",
    fields: {
      "wifi-ssid": "Pl41ntext-SSID",
      "wifi-password": "Pl41ntext-W1fi-Pass",
      "wifi-notes": "wifi-notes-secret",
    },
    secret: {
      ssid: "Pl41ntext-SSID",
      password: "Pl41ntext-W1fi-Pass",
      securityType: "WPA2",
      notes: "wifi-notes-secret",
    },
    sensitive: ["Pl41ntext-W1fi-Pass", "Pl41ntext-SSID", "wifi-notes-secret"],
  },
];

let key: CryptoKey;

beforeEach(async () => {
  key = await deriveVaultKey("test-master", generateSalt(), 1_000);
  setVaultKey(key);
  createVaultItemAction.mockReset();
  createVaultItemAction.mockResolvedValue({ id: "cnewitem0000000000000000" });
});

afterEach(() => {
  cleanup();
  clearVaultKey();
});

const field = (id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`field #${id} not found`);
  return el;
};

describe.each(CASES)(
  "$type dialog",
  ({ type, Dialog, nameField, name, fields, secret, sensitive }) => {
    function renderDialog() {
      const onOpenChange = vi.fn();
      render(<Dialog open onOpenChange={onOpenChange} mode="create" />);
      return { user: userEvent.setup(), onOpenChange };
    }

    it("requires a name and does not call the action without one", async () => {
      const { user } = renderDialog();
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByText("Name is required")).toBeTruthy();
      expect(createVaultItemAction).not.toHaveBeenCalled();
    });

    it("sends only ciphertext — never the plaintext secrets", async () => {
      const { user, onOpenChange } = renderDialog();
      await user.type(field(nameField), name);
      for (const [id, value] of Object.entries(fields)) await user.type(field(id), value);
      await user.click(screen.getByRole("button", { name: "Save" }));

      await vi.waitFor(() => expect(createVaultItemAction).toHaveBeenCalledTimes(1));
      const [args] = createVaultItemAction.mock.calls[0] as [Record<string, unknown>];

      // Exactly these fields reach the server; the name is plain text by design.
      expect(Object.keys(args).sort()).toEqual(["ciphertext", "iv", "name", "type"]);
      expect(args).toMatchObject({ type, name });

      const serialized = JSON.stringify(createVaultItemAction.mock.calls);
      for (const plaintext of sensitive) expect(serialized).not.toContain(plaintext);

      // And the ciphertext really is the secret, encrypted under the vault key.
      const decrypted = await decryptItem(key, {
        ciphertext: args.ciphertext as string,
        iv: args.iv as string,
      });
      expect(decrypted).toEqual(secret);
      await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });
  }
);
