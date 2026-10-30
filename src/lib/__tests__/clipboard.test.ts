import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each test gets a fresh module so the module-level pending timer starts empty.
async function load() {
  vi.resetModules();
  return import("../clipboard");
}

let clipboardText: string;
let writeText: ReturnType<typeof vi.fn>;
let readText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  clipboardText = "";
  writeText = vi.fn(async (t: string) => {
    clipboardText = t;
  });
  readText = vi.fn(async () => clipboardText);
  vi.stubGlobal("navigator", { clipboard: { writeText, readText } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("copySecret", () => {
  it("copies immediately and clears after 30 seconds", async () => {
    const { copySecret } = await load();
    await copySecret("s3cret");
    expect(clipboardText).toBe("s3cret");

    await vi.advanceTimersByTimeAsync(29_999);
    expect(clipboardText).toBe("s3cret");

    await vi.advanceTimersByTimeAsync(1);
    expect(clipboardText).toBe("");
    expect(writeText).toHaveBeenLastCalledWith("");
  });

  it("does not clear something else the user copied meanwhile", async () => {
    const { copySecret } = await load();
    await copySecret("s3cret");
    clipboardText = "a URL the user copied later";

    await vi.advanceTimersByTimeAsync(30_000);
    expect(clipboardText).toBe("a URL the user copied later");
  });

  it("clears anyway when reading the clipboard is refused", async () => {
    readText.mockRejectedValue(new DOMException("Read permission denied", "NotAllowedError"));
    const { copySecret } = await load();
    await copySecret("s3cret");

    await vi.advanceTimersByTimeAsync(30_000);
    expect(clipboardText).toBe("");
  });

  it("honours a custom delay", async () => {
    const { copySecret } = await load();
    await copySecret("s3cret", { clearAfterMs: 5_000 });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(clipboardText).toBe("");
  });

  it("restarts the timer on a newer copy so it is never cleared early", async () => {
    readText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const { copySecret } = await load();
    await copySecret("first");
    await vi.advanceTimersByTimeAsync(10_000);
    await copySecret("second");

    await vi.advanceTimersByTimeAsync(20_000); // 30 s after "first"
    expect(clipboardText).toBe("second");

    await vi.advanceTimersByTimeAsync(10_000); // 30 s after "second"
    expect(clipboardText).toBe("");
  });

  it("swallows a failed clear (e.g. page not focused)", async () => {
    const { copySecret } = await load();
    await copySecret("s3cret");
    writeText.mockRejectedValueOnce(new DOMException("Document is not focused", "NotAllowedError"));
    await expect(vi.advanceTimersByTimeAsync(30_000)).resolves.not.toThrow();
  });

  it("rejects when the copy itself fails, so callers can show an error", async () => {
    writeText.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    const { copySecret } = await load();
    await expect(copySecret("s3cret")).rejects.toThrow();
  });

  it("uses the agreed toast text", async () => {
    const { COPIED_TOAST } = await load();
    expect(COPIED_TOAST).toBe("Copied. Clipboard clears in 30 seconds.");
  });
});
