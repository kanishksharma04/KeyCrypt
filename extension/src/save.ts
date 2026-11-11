// Content script (opt-in: "Offer to save new logins" in the popup, which grants
// the https://*/* optional host permission; src/background.ts registers it).
// When a login form is submitted on an https page, it hands the username and
// password to the extension's background worker, which offers to save them.
// Self-contained (no imports): content scripts can't load modules.

(() => {
  const marker = "__keycryptSaveListener";
  const w = window as unknown as Record<string, boolean>;
  if (w[marker]) return;
  w[marker] = true;

  const local =
    location.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (location.protocol !== "https:" && !local) return;
  if (window.top !== window) return; // top frame only

  const usable = (el: HTMLInputElement) =>
    !el.disabled && el.type !== "hidden" && !el.hidden && el.offsetParent !== null;

  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const passwords = Array.from(
        form.querySelectorAll<HTMLInputElement>('input[type="password"]')
      ).filter((el) => usable(el) && el.value);
      // One password field: a sign-in or a sign-up. Two or more (change password
      // forms) aren't offered.
      if (passwords.length !== 1) return;
      const passwordField = passwords[0];
      if (!passwordField) return;

      const textual = Array.from(form.querySelectorAll<HTMLInputElement>("input")).filter(
        (el) => ["text", "email", "tel", ""].includes(el.type) && usable(el) && el.value
      );
      const before = textual.filter(
        (el) => el.compareDocumentPosition(passwordField) & Node.DOCUMENT_POSITION_FOLLOWING
      );
      const usernameField =
        textual.find((el) => el.autocomplete === "username") ??
        textual.find((el) => /user|email|login/i.test(`${el.name} ${el.id}`)) ??
        before[before.length - 1];

      void chrome.runtime
        .sendMessage({
          type: "login-submitted",
          url: location.href,
          username: usernameField?.value.trim() ?? "",
          password: passwordField.value,
        })
        .catch(() => {});
    },
    true
  );
})();
