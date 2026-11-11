import { currentTotpCode, parseTotpInput, type TotpParams } from "keycrypt/crypto";
import { authenticatorMatchesTab, fillableTabHost, loginMatchesTab } from "./match";
import { fillCodeField, fillLoginForm, type FillCodeResult, type FillResult } from "./fill";
import {
  send,
  type SaveOffer,
  type SaveResponse,
  type Status,
  type UnlockResponse,
} from "./messages";
import { clampUnlockMinutes, UNLOCK_MINUTE_CHOICES } from "./session";
import { APP_URL, type AuthenticatorEntry, type LoginEntry } from "./vault";

// Popup: unlock with the master password (the background worker derives and
// keeps the vault key for a while, src/background.ts), list the logins and
// authenticator codes for the current site, fill one on click, and offer to
// save a login just submitted on the page. Decrypted entries live only in this
// page's memory while it is open. The only thing kept between openings is the
// chosen unlock time (localStorage of the extension's own pages); nothing goes
// to chrome.storage.

const app = document.getElementById("app") as HTMLElement;
const lockButton = document.getElementById("lock") as HTMLButtonElement;
const MINUTES_KEY = "keycrypt.unlockMinutes";

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

function savedMinutes(): number {
  try {
    return clampUnlockMinutes(localStorage.getItem(MINUTES_KEY));
  } catch {
    return clampUnlockMinutes(undefined);
  }
}

function rememberMinutes(minutes: number) {
  try {
    localStorage.setItem(MINUTES_KEY, String(minutes));
  } catch {
    // not available: the default applies next time
  }
}

lockButton.addEventListener("click", () => {
  void send({ type: "lock" }).then(() => {
    lockButton.hidden = true;
    void start();
  });
});

/** The tab to fill: the active tab, or ?tabId= when this page is opened in a tab (testing). */
async function targetTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabId = Number(new URLSearchParams(location.search).get("tabId"));
  if (Number.isInteger(tabId) && tabId > 0) return chrome.tabs.get(tabId);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// ─── Views ───────────────────────────────────────────────────────────────────

function signedOutView() {
  const open = h("button", { className: "primary", type: "button" }, "Sign in to KeyCrypt");
  open.addEventListener("click", () => void chrome.tabs.create({ url: `${APP_URL}/auth/signin` }));
  show(h("p", {}, "You're not signed in to KeyCrypt in this browser."), open);
}

function minutesSelect(id: string, value: number): HTMLSelectElement {
  const select = h("select", { id });
  for (const m of UNLOCK_MINUTE_CHOICES) {
    select.append(h("option", { value: String(m), selected: m === value }, `${m} min`));
  }
  return select;
}

function unlockView(tab: chrome.tabs.Tab | undefined, offer: SaveOffer | null) {
  const input = h("input", {
    id: "master-password",
    type: "password",
    autocomplete: "current-password",
    required: true,
  });
  const minutes = minutesSelect("unlock-minutes", savedMinutes());
  const error = h("p", { className: "error", role: "alert" });
  const submit = h("button", { className: "primary", type: "submit" }, "Unlock");
  const form = h(
    "form",
    {},
    h("label", { htmlFor: "master-password" }, "Master password"),
    input,
    h(
      "div",
      { className: "row" },
      h("label", { htmlFor: "unlock-minutes" }, "Stay unlocked for"),
      minutes
    ),
    error,
    submit
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    error.textContent = "";
    submit.disabled = true;
    submit.textContent = "Unlocking…";
    const chosen = clampUnlockMinutes(minutes.value);
    rememberMinutes(chosen);
    void send<UnlockResponse>({
      type: "unlock",
      password: input.value,
      minutes: chosen,
      tabId: tab?.id,
    })
      .then((result) => {
        input.value = "";
        if (result.state === "wrong-password") {
          error.textContent = "Incorrect master password.";
          return;
        }
        if (result.state === "needs-upgrade") {
          error.textContent = "Open KeyCrypt in the browser once to finish upgrading your vault.";
          return;
        }
        render(result, tab);
      })
      .catch(() => {
        error.textContent = "Couldn't unlock. Check your connection and try again.";
      })
      .finally(() => {
        submit.disabled = false;
        submit.textContent = "Unlock";
      });
  });
  const nodes: Node[] = [form];
  if (offer) {
    nodes.unshift(
      h("p", { className: "muted" }, `Unlock to save the login you just used on ${offer.host}.`)
    );
  }
  show(...nodes);
  input.focus();
}

function saveOfferCard(offer: SaveOffer, tabId: number): HTMLElement {
  const card = h("section", { className: "card", ariaLabel: "Save login" });
  const who = offer.username || "(no username)";
  if (offer.duplicate) {
    card.append(h("p", { className: "muted" }, `This login for ${offer.host} is already saved.`));
    void send({ type: "dismiss-save", tabId });
    return card;
  }
  const status = h("p", { className: "muted", role: "status" });
  const save = h("button", { className: "primary", type: "button" }, "Save login");
  const later = h("button", { type: "button" }, "Not now");
  save.addEventListener("click", () => {
    save.disabled = true;
    void send<SaveResponse>({ type: "save-login", tabId }).then((result) => {
      if (result.ok) {
        card.replaceChildren(h("p", { role: "status" }, `Saved the login for ${offer.host}.`));
      } else {
        status.textContent = result.error;
        save.disabled = false;
      }
    });
  });
  later.addEventListener("click", () => {
    void send({ type: "dismiss-save", tabId });
    card.remove();
  });
  card.append(
    h("p", {}, h("strong", {}, `Save login for ${offer.host}?`)),
    h("p", { className: "muted" }, who),
    h("div", { className: "row" }, save, later),
    status
  );
  return card;
}

function loginTotp(login: LoginEntry): TotpParams | null {
  if (!login.totp) return null;
  try {
    return parseTotpInput(login.totp, { issuer: login.name, account: login.username });
  } catch {
    return null;
  }
}

function render(result: Status, tab: chrome.tabs.Tab | undefined) {
  switch (result.state) {
    case "signed-out":
      lockButton.hidden = true;
      return signedOutView();
    case "no-vault":
      lockButton.hidden = true;
      return show(h("p", {}, "Set up your vault in KeyCrypt first."));
    case "unreachable":
      lockButton.hidden = true;
      return show(h("p", { className: "error" }, `Can't reach KeyCrypt at ${APP_URL}.`));
    case "locked":
      lockButton.hidden = true;
      return unlockView(tab, result.offer);
    case "unlocked":
      lockButton.hidden = false;
      return listView(result, tab);
  }
}

function listView(
  result: Extract<Status, { state: "unlocked" }>,
  tab: chrome.tabs.Tab | undefined
) {
  const nodes: Node[] = [];
  const host = fillableTabHost(tab?.url);
  const tabId = tab?.id;
  if (result.offer && tabId !== undefined) nodes.push(saveOfferCard(result.offer, tabId));

  if (tabId === undefined || !host) {
    nodes.push(h("p", { className: "muted" }, "Logins can be filled on https:// pages."));
  } else {
    const status = h("p", { className: "muted", role: "status" });
    const logins = result.vault.logins.filter((l) => loginMatchesTab(l.url, tab?.url));
    if (logins.length === 0) {
      nodes.push(h("p", { className: "muted" }, `No saved logins for ${host}.`));
    } else {
      const list = h("ul", { ariaLabel: `Logins for ${host}` });
      for (const login of logins) {
        const button = h(
          "button",
          { type: "button", title: `Fill ${login.name}`, className: "entry" },
          h("span", { className: "name" }, login.name),
          h("span", { className: "user" }, login.username || "(no username)")
        );
        button.addEventListener("click", () => void fill(tabId, host, login, status));
        const item = h("li", {}, button);
        const totp = loginTotp(login);
        if (totp) item.append(codeButton(tabId, host, login.name, totp, status));
        list.append(item);
      }
      nodes.push(h("p", { className: "muted" }, `Logins for ${host}`), list);
    }

    const authenticators = result.vault.authenticators.filter((a) =>
      authenticatorMatchesTab(a.issuer, a.account, tab?.url)
    );
    if (authenticators.length > 0) {
      const list = h("ul", { ariaLabel: `Authenticator codes for ${host}` });
      for (const a of authenticators) {
        list.append(
          h(
            "li",
            {},
            h("span", { className: "name" }, a.name),
            codeButton(tabId, host, a.name, authenticatorParams(a), status)
          )
        );
      }
      nodes.push(h("p", { className: "muted" }, "Authenticator codes"), list);
    }
    nodes.push(status);
  }

  nodes.push(settings(result));
  show(...nodes);
}

function authenticatorParams(a: AuthenticatorEntry): TotpParams {
  return {
    secret: a.secret,
    issuer: a.issuer,
    account: a.account,
    algorithm: a.algorithm,
    digits: a.digits,
    period: a.period,
  };
}

function codeButton(
  tabId: number,
  host: string,
  name: string,
  params: TotpParams,
  status: HTMLElement
): HTMLButtonElement {
  const button = h(
    "button",
    { type: "button", className: "code", title: `Fill the code for ${name}` },
    "Fill code"
  );
  button.addEventListener("click", () => void fillCode(tabId, host, name, params, status));
  return button;
}

function settings(result: Extract<Status, { state: "unlocked" }>): HTMLElement {
  const left = Math.max(1, Math.ceil(result.remainingMs / 60_000));
  const saveToggle = h("input", { type: "checkbox", id: "offer-save" });
  void chrome.permissions
    .contains({ origins: ["https://*/*"] })
    .then((granted) => (saveToggle.checked = granted));
  saveToggle.addEventListener("change", () => {
    const origins = ["https://*/*"];
    const change = saveToggle.checked
      ? chrome.permissions.request({ origins })
      : chrome.permissions.remove({ origins }).then((removed) => !removed);
    void change
      .then((granted) => {
        saveToggle.checked = granted;
        return send({ type: "sync-save-script" });
      })
      .catch(() => (saveToggle.checked = false));
  });
  return h(
    "footer",
    {},
    h("p", { className: "muted" }, `Stays unlocked for about ${left} more min.`),
    h(
      "div",
      { className: "row" },
      saveToggle,
      h("label", { htmlFor: "offer-save" }, "Offer to save new logins (all https:// sites)")
    )
  );
}

// ─── Filling ─────────────────────────────────────────────────────────────────

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

async function fillCode(
  tabId: number,
  host: string,
  name: string,
  params: TotpParams,
  status: HTMLElement
) {
  try {
    const { code } = currentTotpCode(params);
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: fillCodeField,
      args: [host, code],
    });
    const result = injection?.result as FillCodeResult | undefined;
    if (result?.ok) {
      status.textContent = `Filled the code for ${name}.`;
      window.close();
    } else {
      status.textContent =
        result?.reason === "host-changed"
          ? "The page changed. Open the popup again."
          : "No code field found on this page.";
    }
  } catch {
    status.textContent = "This page can't be filled.";
  }
}

// ─── Start ───────────────────────────────────────────────────────────────────

async function start() {
  const tab = await targetTab();
  try {
    render(await send<Status>({ type: "status", tabId: tab?.id }), tab);
  } catch {
    show(h("p", { className: "error" }, "KeyCrypt's background worker didn't answer."));
  }
}

void start();
