// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DecryptedVaultItem } from "@/types/vault";
import { VaultToolbar, filterVaultItems } from "../vault-toolbar";

afterEach(cleanup);

const BASE = { createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
const ITEMS: DecryptedVaultItem[] = [
  {
    ...BASE,
    id: "c1",
    type: "LOGIN",
    name: "GitHub",
    favorite: true,
    secret: { username: "octocat", password: "x", url: "https://github.com", notes: "" },
  },
  {
    ...BASE,
    id: "c2",
    type: "LOGIN",
    name: "Bank",
    favorite: false,
    secret: { username: "jane", password: "y", url: "https://bank.example", notes: "" },
  },
  {
    ...BASE,
    id: "c3",
    type: "WIFI_PASSWORD",
    name: "Home",
    favorite: true,
    secret: { ssid: "KeyCrypt-Net", password: "z", securityType: "WPA3", notes: "" },
  },
  {
    ...BASE,
    id: "c4",
    type: "SECURE_NOTE",
    name: "Recovery codes",
    favorite: false,
    secret: { content: "octocat appears only inside a secret note" },
  },
];

describe("filterVaultItems", () => {
  const names = (items: DecryptedVaultItem[]) => items.map((i) => i.name);

  it("matches names, login usernames and URLs, and WiFi SSIDs, case-insensitively", () => {
    expect(names(filterVaultItems(ITEMS, "git", false))).toEqual(["GitHub"]);
    expect(names(filterVaultItems(ITEMS, "JANE", false))).toEqual(["Bank"]);
    expect(names(filterVaultItems(ITEMS, "bank.example", false))).toEqual(["Bank"]);
    expect(names(filterVaultItems(ITEMS, "keycrypt-net", false))).toEqual(["Home"]);
  });

  it("never searches inside secret content", () => {
    // "octocat" is the GitHub username (searchable) and also inside the note (not).
    expect(names(filterVaultItems(ITEMS, "octocat", false))).toEqual(["GitHub"]);
  });

  it("applies the favourites filter, alone and with a query", () => {
    expect(names(filterVaultItems(ITEMS, "", true))).toEqual(["GitHub", "Home"]);
    expect(names(filterVaultItems(ITEMS, "home", true))).toEqual(["Home"]);
    expect(names(filterVaultItems(ITEMS, "bank", true))).toEqual([]);
  });
});

/** The toolbar wired to real state, the way VaultList uses it. */
function Harness({ items, loading = false }: { items: DecryptedVaultItem[]; loading?: boolean }) {
  const [search, setSearch] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const filtered = filterVaultItems(items, search, favOnly);
  return (
    <>
      <VaultToolbar
        search={search}
        onSearchChange={setSearch}
        favOnly={favOnly}
        onFavOnlyChange={setFavOnly}
        onCreate={vi.fn()}
        loading={loading}
        filteredCount={filtered.length}
        totalCount={items.length}
      />
      <ul aria-label="results">
        {filtered.map((i) => (
          <li key={i.id}>{i.name}</li>
        ))}
      </ul>
    </>
  );
}

const results = () => screen.getAllByRole("listitem").map((li) => li.textContent);

describe("VaultToolbar", () => {
  it("shows the total item count, singular and plural", () => {
    const { unmount } = render(<Harness items={ITEMS} />);
    expect(screen.getByText("4 items")).toBeTruthy();
    unmount();

    render(<Harness items={ITEMS.slice(0, 1)} />);
    expect(screen.getByText("1 item")).toBeTruthy();
  });

  it("filters as you type and shows 'N of M items'", async () => {
    const user = userEvent.setup();
    render(<Harness items={ITEMS} />);

    await user.type(screen.getByRole("textbox", { name: "Search vault items" }), "jane");
    expect(results()).toEqual(["Bank"]);
    expect(screen.getByText("1 of 4 items")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(results()).toHaveLength(4);
    expect(screen.getByText("4 items")).toBeTruthy();
  });

  it("toggles the favourites filter", async () => {
    const user = userEvent.setup();
    render(<Harness items={ITEMS} />);

    await user.click(screen.getByRole("button", { name: "Filter favorites" }));
    expect(results()).toEqual(["GitHub", "Home"]);
    expect(screen.getByText("2 of 4 items")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Filter favorites" }));
    expect(results()).toHaveLength(4);
  });

  it("hides the count while loading or when nothing matches", async () => {
    const { unmount } = render(<Harness items={ITEMS} loading />);
    expect(screen.queryByText(/^\d+( of \d+)? items?$/)).toBeNull();
    unmount();

    const user = userEvent.setup();
    render(<Harness items={ITEMS} />);
    await user.type(screen.getByRole("textbox", { name: "Search vault items" }), "zzz");
    expect(screen.queryByText(/^\d+( of \d+)? items?$/)).toBeNull();
  });

  it("focuses search on '/' and clears it on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness items={ITEMS} />);
    const search = screen.getByRole("textbox", { name: "Search vault items" });

    await user.keyboard("/");
    expect(document.activeElement).toBe(search);
    await user.keyboard("git");
    expect(results()).toEqual(["GitHub"]);
    await user.keyboard("{Escape}");
    expect((search as HTMLInputElement).value).toBe("");
    expect(document.activeElement).not.toBe(search);
  });
});
