// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { estimatePasswordStrength, isPasswordStrengthEstimatorLoaded } from "@/lib/crypto";
import { PasswordStrengthMeter } from "../password-strength-meter";

afterEach(cleanup);

describe("PasswordStrengthMeter", () => {
  it("renders nothing to read for an empty password", () => {
    render(<PasswordStrengthMeter password="" />);
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("lazy-loads zxcvbn and re-renders with its verdict", async () => {
    expect(isPasswordStrengthEstimatorLoaded()).toBe(false);
    render(<PasswordStrengthMeter password="P@ssw0rd!" />);
    // Built-in estimate first (all four character classes)...
    expect(screen.getByRole("meter", { name: "Password strength: Fair" })).toBeTruthy();
    // ...then zxcvbn recognises a common password.
    expect(await screen.findByRole("meter", { name: "Password strength: Weak" })).toBeTruthy();
    expect(isPasswordStrengthEstimatorLoaded()).toBe(true);
  });

  it.each([
    ["abc", "Weak", 1],
    ["kT9#mq2", "Fair", 2],
    ["kT9#mq2Lw", "Good", 3],
    ["Correct-Horse-Battery-9", "Strong", 4],
  ])("shows the shared estimator's level for %s", (password, label, filled) => {
    expect(estimatePasswordStrength(password).label).toBe(label);
    render(<PasswordStrengthMeter password={password} />);
    const meter = screen.getByRole("meter", { name: `Password strength: ${label}` });
    expect(meter.getAttribute("aria-valuenow")).toBe(String(filled));
    expect(screen.getByText(label)).toBeTruthy();
  });
});
