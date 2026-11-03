import { fillableTabHost, loginMatchesTab } from "./match";
import { fillLoginForm, type FillResult } from "./fill";
import {
  APP_URL,
  fetchVaultMeta,
  loadLogins,
  NotSignedInError,
  unlock,
  type LoginEntry,
  type VaultMeta,
} from "./vault";

// Popup: unlock with the master password, list the logins saved for the
// current site, fill one on click. The vault key and decrypted logins live
// only in this page's memory and are gone when the popup closes; nothing is
// written to chrome.storage.

const app = document.getElementById("app") as HTMLElement;
const lockButton = document.getElementById("lock") as HTMLButtonElement;

let vaultKey: CryptoKey | null = null;
let logins: LoginEntry[] = [];

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.assign(el, props);
  el.append(...children);
  return el;
}

function show(...nodes: Node[]) {
  app.replaceChildren(...nodes);
}

function lock() {
  vaultKey = null;
  logins = [];
  lockButton.hidden = true;
  void start();
}
lockButton.addEventListener("click", lock);

/** The tab to fill: the active tab, or ?tabId= when this page is opened in a tab (testing). */
async function targetTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabId = Number(new URLSearchParams(location.search).get("tabId"));
  if (Number.isInteger(tabId) && tabId > 0) return chrome.tabs.get(tabId);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function signedOutView() {
  const open = h("button", { className: "primary", type: "button" }, "Sign in to KeyCrypt");
  open.addEventListener("click", () => void chrome.tabs.create({ url: `${APP_URL}/auth/signin` }));
  show(h("p", {}, "You're not signed in to KeyCrypt in this browser."), open);
}

function unlockView(meta: VaultMeta, tab: chrome.tabs.Tab | undefined) {
  const input = h("input", {
    id: "master-password",
    type: "password",
    autocomplete: "current-password",
    required: true,
  });
  const error = h("p", { className: "error", role: "alert" });
  const submit = h("button", { className: "primary", type: "submit" }, "Unlock");
  const form = h(
    "form",
    {},
    h("label", { htmlFor: "master-password" }, "Master password"),
    input,
    error,
    submit
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    error.textContent = "";
    submit.disabled = true;
    submit.textContent = "Unlocking…";
    void unlock(input.value, meta)
      .then(async (result) => {
        input.value = "";
        if (result.status === "wrong-password") {
          error.textContent = "Incorrect master password.";
          return;
        }
        if (result.status === "needs-upgrade") {
          error.textContent = "Open KeyCrypt in the browser once to finish upgrading your vault.";
          return;
        }
        vaultKey = result.key;
        lockButton.hidden = false;
        logins = await loadLogins(vaultKey, meta.userId);
        listView(tab);
      })
      .catch(() => {
        error.textContent = "Couldn't unlock. Check your connection and try again.";
      })
      .finally(() => {
        submit.disabled = false;
        submit.textContent = "Unlock";
      });
  });
  show(form);
  input.focus();
}

function listView(tab: chrome.tabs.Tab | undefined) {
  const host = fillableTabHost(tab?.url);
  if (!tab?.id || !host) {
    show(h("p", { className: "muted" }, "Logins can be filled on https:// pages."));
    return;
  }
  const matches = logins.filter((l) => loginMatchesTab(l.url, tab.url));
  if (matches.length === 0) {
    show(h("p", { className: "muted" }, `No saved logins for ${host}.`));
    return;
  }
  const status = h("p", { className: "muted", role: "status" });
  const list = h("ul", { ariaLabel: `Logins for ${host}` });
  for (const login of matches) {
    const button = h(
      "button",
      { type: "button", title: `Fill ${login.name}` },
      h("span", { className: "name" }, login.name),
      h("span", { className: "user" }, login.username || "(no username)")
    );
    button.addEventListener("click", () => void fill(tab.id!, host, login, status));
    list.append(h("li", {}, button));
  }
  show(h("p", { className: "muted" }, `Logins for ${host}`), list, status);
}

async function fill(tabId: number, host: string, login: LoginEntry, status: HTMLElement) {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: fillLoginForm,
      args: [host, login.username, login.password],
    });
    const result = injection?.result as FillResult | undefined;
    if (result?.ok) {
      status.textContent = `Filled ${login.name}.`;
      window.close();
    } else {
      status.textContent =
        result?.reason === "host-changed"
          ? "The page changed. Open the popup again."
          : "No password field found on this page.";
    }
  } catch {
    status.textContent = "This page can't be filled.";
  }
}

async function start() {
  const tab = await targetTab();
  let meta: VaultMeta;
  try {
    meta = await fetchVaultMeta();
  } catch (err) {
    if (err instanceof NotSignedInError) return signedOutView();
    show(h("p", { className: "error" }, `Can't reach KeyCrypt at ${APP_URL}.`));
    return;
  }
  if (vaultKey) listView(tab);
  else unlockView(meta, tab);
}

void start();
