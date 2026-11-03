// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { TotpCode } from "../totp-code";

// RFC 6238 Appendix B: SHA-1 key "12345678901234567890" (base32 below),
// 8 digits, 30 s: T=59 → 94287082; T=1111111109 → 07081804, T=1111111111 → 14050471.
const RFC_SHA1 = {
  secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  issuer: "RFC",
  account: "test",
  algorithm: "SHA1" as const,
  digits: 8,
  period: 30,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TotpCode", () => {
  it("shows the RFC 6238 code for the current time, with a countdown", () => {
    vi.setSystemTime(59_000);
    render(<TotpCode params={RFC_SHA1} />);
    expect(screen.getByTestId("totp-code").textContent).toBe("9428 7082");
    expect(screen.getByRole("timer").getAttribute("aria-label")).toBe("Changes in 1 seconds");
  });

  it("updates every second and rolls over to the next code", () => {
    vi.setSystemTime(1_111_111_109_000);
    render(<TotpCode params={RFC_SHA1} />);
    expect(screen.getByTestId("totp-code").textContent).toBe("0708 1804");
    act(() => {
      vi.advanceTimersByTime(2_000); // T=1111111111, next 30 s step
    });
    expect(screen.getByTestId("totp-code").textContent).toBe("1405 0471");
    expect(screen.getByRole("timer").getAttribute("aria-label")).toBe("Changes in 29 seconds");
  });

  it("formats 6-digit codes as 3 + 3", () => {
    vi.setSystemTime(59_000);
    render(<TotpCode params={{ ...RFC_SHA1, digits: 6 }} />);
    expect(screen.getByTestId("totp-code").textContent).toBe("287 082");
  });

  it("says so when the key is damaged", () => {
    render(<TotpCode params={{ ...RFC_SHA1, secret: "!!!" }} />);
    expect(screen.getByText("This authenticator key is damaged.")).toBeTruthy();
  });
});
