// Which saved logins belong to the current tab (pure; unit-tested).
//
// A login matches when its URL's host equals the tab's host, or the tab is on a
// subdomain of it (a login saved for example.com matches login.example.com,
// never evil-example.com). "www." is ignored. Only https:// pages are filled,
// plus http://localhost and http://127.0.0.1 for local development.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/** Host of a saved URL ("example.com/login" is read as https). Null if unusable. */
export function savedHost(url: string): string | null {
  const value = url.trim();
  if (!value) return null;
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.hostname ? normalizeHost(parsed.hostname) : null;
  } catch {
    return null;
  }
}

/** The tab's host if logins may be filled there, else null. */
export function fillableTabHost(tabUrl: string | undefined): string | null {
  if (!tabUrl) return null;
  let url: URL;
  try {
    url = new URL(tabUrl);
  } catch {
    return null;
  }
  if (url.protocol === "https:") return url.hostname.toLowerCase();
  if (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)) return url.hostname;
  return null;
}

export function loginMatchesTab(savedUrl: string, tabUrl: string | undefined): boolean {
  const tabHost = fillableTabHost(tabUrl);
  const host = savedHost(savedUrl);
  if (!tabHost || !host) return false;
  const tab = normalizeHost(tabHost);
  return tab === host || tab.endsWith(`.${host}`);
}

/**
 * Whether an authenticator item (issuer, account) belongs to the tab. These
 * items have no URL, so: its issuer equals the site's name (the label just
 * before the top-level domain: "GitHub" on github.com or accounts.github.com,
 * never on github.com.evil.example), or its account is an address at the
 * site's domain. Only decides which codes the popup offers; filling still
 * needs a click. A look-alike with the same name under another top-level
 * domain (github.net) would match an issuer too (see the README).
 */
export function authenticatorMatchesTab(
  issuer: string,
  account: string,
  tabUrl: string | undefined
): boolean {
  const tabHost = fillableTabHost(tabUrl);
  if (!tabHost) return false;
  const tab = normalizeHost(tabHost);
  const siteName = (tab.split(".").at(-2) ?? "").replace(/[^a-z0-9]/g, "");
  const issuerName = issuer.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (issuerName.length >= 2 && issuerName === siteName) return true;
  const at = account.lastIndexOf("@");
  if (at > 0) {
    const domain = normalizeHost(account.slice(at + 1));
    if (domain.includes(".") && (tab === domain || tab.endsWith(`.${domain}`))) return true;
  }
  return false;
}

/** Whether a submitted login on this page may be offered for saving (https, or local http). */
export function saveableUrl(pageUrl: string | undefined): boolean {
  return fillableTabHost(pageUrl) !== null;
}
