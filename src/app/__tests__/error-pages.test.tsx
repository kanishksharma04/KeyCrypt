// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ErrorPage from "../error";
import GlobalError from "../global-error";

// A client-side error message can contain decrypted vault data.
const SECRET_MESSAGE = "Cannot parse item: password=Hunter2-correct-horse";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each([
  ["app/error.tsx", ErrorPage],
  ["app/global-error.tsx", GlobalError],
])("%s", (_name, Page) => {
  it("shows a plain message and the digest, never the error message", () => {
    // global-error renders <html>; React warns about nesting it in a test container.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error(SECRET_MESSAGE), { digest: "4242424242" });
    render(<Page error={error} reset={() => {}} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeTruthy();
    expect(screen.getByText("Error reference: 4242424242")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Hunter2");
  });

  it("sends nothing over the network", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const beacon = vi.fn();
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    render(<Page error={new Error(SECRET_MESSAGE)} reset={() => {}} />);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });
});
