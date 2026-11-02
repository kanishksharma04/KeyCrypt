// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { estimatePasswordStrength } from "@/lib/crypto";
import { PasswordStrengthMeter } from "../password-strength-meter";

afterEach(cleanup);

describe("PasswordStrengthMeter", () => {
  it("renders nothing to read for an empty password", () => {
    render(<PasswordStrengthMeter password="" />);
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it.each([
    ["abc", "Weak", 1],
    ["abcdefghij", "Fair", 2],
    ["Abcdefgh1234", "Good", 3],
    ["Correct-Horse-Battery-9", "Strong", 4],
  ])("shows the shared estimator's level for %s", (password, label, filled) => {
    expect(estimatePasswordStrength(password).label).toBe(label);
    render(<PasswordStrengthMeter password={password} />);
    const meter = screen.getByRole("meter", { name: `Password strength: ${label}` });
    expect(meter.getAttribute("aria-valuenow")).toBe(String(filled));
    expect(screen.getByText(label)).toBeTruthy();
  });
});
