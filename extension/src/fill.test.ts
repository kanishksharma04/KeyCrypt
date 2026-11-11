// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fillCodeField, fillLoginForm } from "./fill";

afterEach(() => {
  document.body.innerHTML = "";
});

function form(html: string) {
  document.body.innerHTML = html;
}
const value = (selector: string) => document.querySelector<HTMLInputElement>(selector)?.value;

describe("fillLoginForm", () => {
  const host = location.hostname.toLowerCase(); // jsdom: "localhost"

  it("fills username and password and fires input/change events", () => {
    form(`<form><input id="u" type="email" name="email"><input id="p" type="password"></form>`);
    const events: string[] = [];
    document.getElementById("p")!.addEventListener("input", () => events.push("input"));
    document.getElementById("p")!.addEventListener("change", () => events.push("change"));

    expect(fillLoginForm(host, "jane@example.test", "s3cret!")).toEqual({ ok: true });
    expect(value("#u")).toBe("jane@example.test");
    expect(value("#p")).toBe("s3cret!");
    expect(events).toEqual(["input", "change"]);
  });

  it("prefers autocomplete=username, and skips hidden or disabled fields", () => {
    form(`<form>
      <input id="search" type="text" name="q">
      <input id="hidden" type="text" style="display:none" name="user">
      <input id="user" type="text" autocomplete="username">
      <input id="pw-hidden" type="password" style="display:none">
      <input id="pw-disabled" type="password" disabled>
      <input id="pw" type="password">
    </form>`);
    expect(fillLoginForm(host, "jane", "pw1")).toEqual({ ok: true });
    expect(value("#user")).toBe("jane");
    expect(value("#search")).toBe("");
    expect(value("#hidden")).toBe("");
    expect(value("#pw")).toBe("pw1");
    expect(value("#pw-hidden")).toBe("");
  });

  it("falls back to the last text field before the password", () => {
    form(
      `<div><input id="a" type="text"><input id="b" type="text"><input id="p" type="password"></div>`
    );
    fillLoginForm(host, "jane", "pw");
    expect(value("#a")).toBe("");
    expect(value("#b")).toBe("jane");
  });

  it("refuses to fill if the page is on another host now", () => {
    form(`<input id="u" type="text"><input id="p" type="password">`);
    expect(fillLoginForm("example.com", "jane", "pw")).toEqual({
      ok: false,
      reason: "host-changed",
    });
    expect(value("#p")).toBe("");
  });

  it("reports a page without a password field", () => {
    form(`<input type="text">`);
    expect(fillLoginForm(host, "jane", "pw")).toEqual({ ok: false, reason: "no-password-field" });
  });

  it("works with frameworks that track the native value setter", () => {
    form(`<input id="u" type="text"><input id="p" type="password">`);
    const p = document.getElementById("p") as HTMLInputElement;
    const spy = vi.fn();
    p.addEventListener("input", (e) => spy((e.target as HTMLInputElement).value));
    fillLoginForm(host, "", "pw");
    expect(spy).toHaveBeenCalledWith("pw");
    expect(value("#u")).toBe(""); // no username given: left alone
  });
});

describe("fillCodeField", () => {
  const host = location.hostname.toLowerCase();

  it("prefers autocomplete=one-time-code and fires input/change", () => {
    form(`<input id="search" type="text" name="q"><input id="otp" autocomplete="one-time-code">`);
    const events: string[] = [];
    document.getElementById("otp")?.addEventListener("input", () => events.push("input"));
    expect(fillCodeField(host, "123456")).toEqual({ ok: true });
    expect(value("#otp")).toBe("123456");
    expect(value("#search")).toBe("");
    expect(events).toEqual(["input"]);
  });

  it("falls back to a field named like a code, then to a short numeric field", () => {
    form(`<input id="a" name="email"><input id="b" name="totp_code">`);
    expect(fillCodeField(host, "654321")).toEqual({ ok: true });
    expect(value("#b")).toBe("654321");

    form(`<input id="c" inputmode="numeric" maxlength="6">`);
    expect(fillCodeField(host, "111222")).toEqual({ ok: true });
    expect(value("#c")).toBe("111222");
  });

  it("refuses another host, and pages without a code field", () => {
    form(`<input autocomplete="one-time-code">`);
    expect(fillCodeField("evil.example", "123456")).toEqual({ ok: false, reason: "host-changed" });
    form(`<input name="email"><input type="password">`);
    expect(fillCodeField(host, "123456")).toEqual({ ok: false, reason: "no-code-field" });
  });
});
