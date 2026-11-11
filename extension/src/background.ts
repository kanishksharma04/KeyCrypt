import { loginMatchesTab, saveableUrl, savedHost } from "./match";
import type { Request, SaveOffer, SaveResponse, Status, UnlockResponse } from "./messages";
import { clampUnlockMinutes, DEFAULT_UNLOCK_MINUTES, PendingLogins, VaultSession } from "./session";
import {
  APP_URL,
  fetchVaultMeta,
  loadVault,
  NotSignedInError,
  NoVaultError,
  saveLogin,
  unlock,
} from "./vault";

// Background service worker: holds the unlocked vault key in memory for a
// limited time (src/session.ts), decrypts for the popup, and keeps submitted
// logins (in memory, a few minutes) until the user saves or dismisses them.
//
// The key is dropped when the timeout passes (checked on every request and by
// a 30-second alarm), on Lock, when the KeyCrypt session cookie goes away, and
// when the browser closes (the worker's memory goes with it). If the browser
// stops the worker early, the key is gone too and the popup asks to unlock
// again. Nothing is written to chrome.storage.

const session = new VaultSession();
const pending = new PendingLogins();
let unlockMinutes = DEFAULT_UNLOCK_MINUTES;

const TICK = "keycrypt-tick";
const SAVE_SCRIPT_ID = "keycrypt-save";
const SAVE_ORIGINS = ["https://*/*"];
const APP_HOST = new URL(APP_URL).hostname;

// ─── Lifetime ────────────────────────────────────────────────────────────────

/** Keep a 30-second tick going while there is a key or a pending login to expire. */
function tickWhileNeeded(now = Date.now()) {
  const active = session.get(now) !== null || hasPending(now);
  if (active) void chrome.alarms.create(TICK, { periodInMinutes: 0.5 });
  else void chrome.alarms.clear(TICK);
}

const pendingTabs = new Set<number>();
function hasPending(now: number): boolean {
  for (const tabId of pendingTabs) if (pending.get(tabId, now)) return true;
  return false;
}

function clearBadge(tabId: number) {
  pendingTabs.delete(tabId);
  void chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
}

function lockAll() {
  session.lock();
  for (const tabId of [...pendingTabs]) clearBadge(tabId);
  pending.clear();
  void chrome.alarms.clear(TICK);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== TICK) return;
  const now = Date.now();
  for (const tabId of pending.sweep(now)) clearBadge(tabId);
  tickWhileNeeded(now);
});

// Signed out (or the session expired): the key must not outlive it. A refreshed
// session cookie is an "overwrite" and doesn't count.
chrome.cookies.onChanged.addListener(({ removed, cause, cookie }) => {
  if (!removed || cause === "overwrite") return;
  if (!/authjs\.session-token/.test(cookie.name)) return;
  const domain = cookie.domain.replace(/^\./, "");
  if (APP_HOST === domain || APP_HOST.endsWith(`.${domain}`)) lockAll();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  pending.delete(tabId);
  pendingTabs.delete(tabId);
});

// ─── "Offer to save new logins" (optional https://*/* permission) ────────────

async function syncSaveScript(): Promise<boolean> {
  const granted = await chrome.permissions.contains({ origins: SAVE_ORIGINS });
  const registered = (await chrome.scripting.getRegisteredContentScripts()).some(
    (s) => s.id === SAVE_SCRIPT_ID
  );
  if (granted && !registered) {
    await chrome.scripting.registerContentScripts([
      { id: SAVE_SCRIPT_ID, matches: SAVE_ORIGINS, js: ["save.js"], runAt: "document_idle" },
    ]);
  } else if (!granted && registered) {
    await chrome.scripting.unregisterContentScripts({ ids: [SAVE_SCRIPT_ID] });
  }
  return granted;
}

chrome.runtime.onInstalled.addListener(() => void syncSaveScript());
chrome.runtime.onStartup.addListener(() => void syncSaveScript());
chrome.permissions.onRemoved.addListener(() => void syncSaveScript());

// ─── Requests ────────────────────────────────────────────────────────────────

function offerFor(tabId: number | undefined, now: number) {
  return tabId === undefined ? null : pending.get(tabId, now);
}

async function status(tabId: number | undefined): Promise<Status> {
  let userId: string;
  try {
    ({ userId } = await fetchVaultMeta());
  } catch (err) {
    if (err instanceof NotSignedInError) {
      lockAll();
      return { state: "signed-out" };
    }
    if (err instanceof NoVaultError) return { state: "no-vault" };
    return { state: "unreachable" };
  }

  const now = Date.now();
  let held = session.get(now);
  // Another account signed in on this browser: never reuse the old key.
  if (held && held.userId !== userId) {
    lockAll();
    held = null;
  }
  const submitted = offerFor(tabId, now);
  if (!held) {
    const offer: SaveOffer | null = submitted
      ? { host: submitted.host, username: submitted.username, duplicate: false }
      : null;
    return { state: "locked", offer };
  }

  const vault = await loadVault(held.key, held.userId);
  const offer: SaveOffer | null = submitted
    ? {
        host: submitted.host,
        username: submitted.username,
        duplicate: vault.logins.some(
          (l) =>
            loginMatchesTab(l.url, submitted.url) &&
            l.username === submitted.username &&
            l.password === submitted.password
        ),
      }
    : null;
  return {
    state: "unlocked",
    vault,
    remainingMs: session.remaining(Date.now()),
    minutes: unlockMinutes,
    offer,
  };
}

async function handleUnlock(
  password: string,
  minutes: number,
  tabId: number | undefined
): Promise<UnlockResponse> {
  let meta;
  try {
    meta = await fetchVaultMeta();
  } catch (err) {
    if (err instanceof NotSignedInError) return { state: "signed-out" };
    if (err instanceof NoVaultError) return { state: "no-vault" };
    return { state: "unreachable" };
  }
  const result = await unlock(password, meta);
  if (result.status !== "unlocked") return { state: result.status };
  unlockMinutes = clampUnlockMinutes(minutes);
  session.unlock(result.key, meta.userId, unlockMinutes, Date.now());
  tickWhileNeeded();
  return status(tabId);
}

async function handleSave(tabId: number): Promise<SaveResponse> {
  const now = Date.now();
  const held = session.get(now);
  if (!held) return { ok: false, error: "Unlock first." };
  const submitted = pending.get(tabId, now);
  if (!submitted) return { ok: false, error: "There's nothing to save any more." };
  try {
    await saveLogin(held.key, held.userId, {
      name: submitted.host.replace(/^www\./, ""),
      username: submitted.username,
      password: submitted.password,
      url: new URL(submitted.url).origin,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save." };
  }
  pending.delete(tabId);
  clearBadge(tabId);
  return { ok: true };
}

function handleSubmitted(
  message: Extract<Request, { type: "login-submitted" }>,
  sender: chrome.runtime.MessageSender
) {
  const tabId = sender.tab?.id;
  const url = sender.url ?? message.url;
  if (tabId === undefined || !saveableUrl(url) || !message.password) return;
  const host = savedHost(url);
  if (!host) return;
  pending.set({
    tabId,
    url,
    host,
    username: message.username.slice(0, 256),
    password: message.password.slice(0, 4096),
    at: Date.now(),
  });
  pendingTabs.add(tabId);
  void chrome.action.setBadgeText({ tabId, text: "+" }).catch(() => {});
  void chrome.action.setBadgeBackgroundColor({ tabId, color: "#8a5a2b" }).catch(() => {});
  tickWhileNeeded();
}

async function handle(message: Request, sender: chrome.runtime.MessageSender): Promise<unknown> {
  // Only this extension's own pages and content scripts can talk to the worker.
  if (sender.id !== chrome.runtime.id) return { error: "forbidden" };
  switch (message.type) {
    case "status":
      return status(message.tabId);
    case "unlock":
      return handleUnlock(message.password, message.minutes, message.tabId);
    case "lock":
      lockAll();
      return { ok: true };
    case "save-login":
      return handleSave(message.tabId);
    case "dismiss-save":
      pending.delete(message.tabId);
      clearBadge(message.tabId);
      return { ok: true };
    case "sync-save-script":
      return { granted: await syncSaveScript() };
    case "login-submitted":
      handleSubmitted(message, sender);
      return { ok: true };
  }
}

chrome.runtime.onMessage.addListener((message: Request, sender, sendResponse) => {
  handle(message, sender).then(sendResponse, () => sendResponse({ error: "failed" }));
  return true; // answer asynchronously
});
