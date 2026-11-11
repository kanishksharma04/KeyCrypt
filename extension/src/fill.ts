// Injected into the page with chrome.scripting.executeScript (a content script
// that runs once, on the user's click). It must be self-contained: no imports,
// no closures over module scope.

export type FillResult = { ok: true } | { ok: false; reason: "host-changed" | "no-password-field" };

export function fillLoginForm(
  expectedHost: string,
  username: string,
  password: string
): FillResult {
  // The page may have navigated since the popup matched it: never fill elsewhere.
  if (location.hostname.toLowerCase() !== expectedHost)
    return { ok: false, reason: "host-changed" };

  const usable = (el: HTMLInputElement) => {
    if (el.disabled || el.readOnly || el.type === "hidden" || el.hidden) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  };
  const setValue = (el: HTMLInputElement, value: string) => {
    // Use the native setter so frameworks (React, Vue) see the change.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const passwordField = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="password"]')
  ).find(usable);
  if (!passwordField) return { ok: false, reason: "no-password-field" };

  if (username) {
    const scope: ParentNode = passwordField.form ?? document;
    const textual = Array.from(scope.querySelectorAll<HTMLInputElement>("input")).filter(
      (el) => ["text", "email", "tel", ""].includes(el.type) && usable(el)
    );
    const before = textual.filter(
      (el) => el.compareDocumentPosition(passwordField) & Node.DOCUMENT_POSITION_FOLLOWING
    );
    const usernameField =
      textual.find((el) => el.autocomplete === "username") ??
      textual.find((el) => /user|email|login/i.test(`${el.name} ${el.id}`)) ??
      before[before.length - 1];
    if (usernameField) setValue(usernameField, username);
  }
  setValue(passwordField, password);
  return { ok: true };
}

export type FillCodeResult = { ok: true } | { ok: false; reason: "host-changed" | "no-code-field" };

/**
 * Injected like fillLoginForm: puts a one-time code into the page's code
 * field (autocomplete="one-time-code", or a field named like otp/code/totp/2fa,
 * or a short numeric input). Self-contained, no imports.
 */
export function fillCodeField(expectedHost: string, code: string): FillCodeResult {
  if (location.hostname.toLowerCase() !== expectedHost)
    return { ok: false, reason: "host-changed" };

  const usable = (el: HTMLInputElement) => {
    if (el.disabled || el.readOnly || el.type === "hidden" || el.hidden) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  };
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input")).filter(
    (el) => ["text", "tel", "number", ""].includes(el.type) && usable(el)
  );
  const field =
    inputs.find((el) => el.autocomplete === "one-time-code") ??
    inputs.find((el) =>
      /otp|totp|2fa|mfa|one.?time|verification|auth.?code|\bcode\b/i.test(
        `${el.name} ${el.id} ${el.placeholder} ${el.getAttribute("aria-label") ?? ""}`
      )
    ) ??
    inputs.find((el) => el.inputMode === "numeric" && el.maxLength >= 6 && el.maxLength <= 8);
  if (!field) return { ok: false, reason: "no-code-field" };

  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(field, code);
  else field.value = code;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true };
}
