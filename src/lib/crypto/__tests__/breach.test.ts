import { createHash } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BreachCheckError, countPasswordBreaches, sha1Hex } from "@/lib/crypto";

const sha1 = (s: string) => createHash("sha1").update(s, "utf8").digest("hex").toUpperCase();

/** A fake Pwned Passwords range API holding these breached passwords → counts. */
function fakeApi(breached: Record<string, number>) {
  const bySuffix = new Map(Object.entries(breached).map(([pw, n]) => [sha1(pw), n]));
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const prefix = url.slice(url.lastIndexOf("/") + 1);
    const lines = [...bySuffix]
      .filter(([hash]) => hash.startsWith(prefix))
      .map(([hash, n]) => `${hash.slice(5)}:${n}`);
    // Add-Padding: decoy rows with a count of 0.
    lines.push(`${"0".repeat(35)}:0`, `${"F".repeat(35)}:0`);
    return new Response(lines.join("\r\n"), { status: 200 });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sha1Hex", () => {
  it("matches Node's SHA-1, uppercase hex", async () => {
    expect(await sha1Hex("password")).toBe("5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8");
    expect(await sha1Hex("pässwörd ✓")).toBe(sha1("pässwörd ✓"));
  });
});

describe("countPasswordBreaches", () => {
  it("counts breached passwords and returns 0 for the rest", async () => {
    const api = fakeApi({ password: 9_659_365, "hunter2!": 17 });
    expect(
      await countPasswordBreaches(["password", "kT9#mq2Lw4!x-unique", "hunter2!"], api)
    ).toEqual([9_659_365, 0, 17]);
  });

  it("sends only the 5-character hash prefix, with Add-Padding and no credentials", async () => {
    const api = fakeApi({});
    const secret = "My-Very-Secret-Pw-1";
    await countPasswordBreaches([secret], api);

    expect(api).toHaveBeenCalledTimes(1);
    const [url, init] = api.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${sha1(secret).slice(0, 5)}`);
    expect(new Headers(init.headers).get("Add-Padding")).toBe("true");
    expect(init.credentials).toBe("omit");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(init.method ?? "GET").toBe("GET");
    expect(init.body).toBeUndefined();

    // Neither the password nor the rest of its hash appears anywhere in the request.
    const sent = JSON.stringify([url, init]);
    expect(sent).not.toContain(secret);
    expect(sent).not.toContain(sha1(secret).slice(5));
  });

  it("makes one request per distinct prefix", async () => {
    const api = fakeApi({ password: 3 });
    expect(await countPasswordBreaches(["password", "password", "password"], api)).toEqual([
      3, 3, 3,
    ]);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("ignores padding rows", async () => {
    const api = vi.fn(async () => new Response(`${sha1("x").slice(5)}:0\r\n`, { status: 200 }));
    expect(await countPasswordBreaches(["x"], api)).toEqual([0]);
  });

  it("uses the global fetch by default", async () => {
    const api = fakeApi({ password: 1 });
    vi.stubGlobal("fetch", api);
    expect(await countPasswordBreaches(["password"])).toEqual([1]);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("throws BreachCheckError when the API fails or is unreachable", async () => {
    const down = vi.fn(async () => new Response("busy", { status: 503 }));
    await expect(countPasswordBreaches(["a"], down)).rejects.toBeInstanceOf(BreachCheckError);
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(countPasswordBreaches(["a"], offline)).rejects.toBeInstanceOf(BreachCheckError);
  });

  it("does nothing for an empty list", async () => {
    const api = fakeApi({});
    expect(await countPasswordBreaches([], api)).toEqual([]);
    expect(api).not.toHaveBeenCalled();
  });
});
