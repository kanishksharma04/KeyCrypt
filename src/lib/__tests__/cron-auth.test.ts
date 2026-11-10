import { describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "../cron-auth";

const SECRET = "cron-secret-for-tests-0123456789";

describe("isAuthorizedCronRequest", () => {
  it("accepts exactly `Bearer <CRON_SECRET>`", () => {
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("refuses a missing, wrong or malformed header", () => {
    for (const header of [
      null,
      "",
      SECRET, // no scheme
      `bearer ${SECRET}`,
      `Bearer ${SECRET} `,
      `Bearer ${SECRET.slice(0, -1)}`,
      `Bearer ${SECRET}x`,
      "Bearer ",
      `Basic ${SECRET}`,
    ]) {
      expect(isAuthorizedCronRequest(header, SECRET)).toBe(false);
    }
  });

  it("fails closed when CRON_SECRET is unset, empty or too short", () => {
    expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer undefined", undefined)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer short", "short")).toBe(false);
  });
});
