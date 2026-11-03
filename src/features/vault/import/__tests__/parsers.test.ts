import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { ExportDecryptionError } from "@/lib/crypto";
import {
  countByType,
  detectImportFormat,
  ImportFormatError,
  parseImportFile,
  type ImportFormat,
  type ImportedItem,
} from "..";

const fixture = (name: string) => readFileSync(resolve(__dirname, "fixtures", name), "utf8");
const byName = (items: ImportedItem[], name: string) => {
  const item = items.find((i) => i.name === name);
  if (!item) throw new Error(`no item named ${name}`);
  return item;
};

describe("detectImportFormat", () => {
  it.each<[string, ImportFormat]>([
    ["bitwarden.json", "bitwarden-json"],
    ["bitwarden.csv", "bitwarden-csv"],
    ["1password.csv", "1password-csv"],
    ["lastpass.csv", "lastpass-csv"],
    ["chrome.csv", "chrome-csv"],
    ["keycrypt-export.json", "keycrypt-export"],
  ])("recognises %s", (file, format) => {
    expect(detectImportFormat(fixture(file))).toBe(format);
  });

  it("returns null for anything else", () => {
    expect(detectImportFormat("hello,world\n1,2")).toBeNull();
    expect(detectImportFormat("{ not json")).toBeNull();
    expect(detectImportFormat('{"foo": 1}')).toBeNull();
  });
});

describe("Bitwarden JSON", () => {
  it("maps logins, notes, typed notes and other items", async () => {
    const { items, skipped } = await parseImportFile("bitwarden-json", fixture("bitwarden.json"));
    expect(countByType({ items, skipped })).toEqual({ LOGIN: 2, SECURE_NOTE: 3, API_KEY: 1 });

    expect(byName(items, "GitHub")).toEqual({
      type: "LOGIN",
      name: "GitHub",
      favorite: true,
      secret: {
        username: "octocat",
        password: 'gh-S3cret, "quoted" ✓',
        url: "https://github.com/login",
        notes:
          "Work account\n\nOther URLs: https://gist.github.com\n" +
          "TOTP: otpauth://totp/GitHub:octocat?secret=JBSWY3DPEHPK3PXP&issuer=GitHub\n" +
          "Recovery email: me@example.test",
      },
    });
    expect(byName(items, "Door codes").secret).toEqual({ content: "Front: 1234\nBack: 5678" });
    expect(byName(items, "Stripe key")).toMatchObject({
      type: "API_KEY",
      secret: { key: "sk_live_123", description: "Payments", notes: "live" },
    });
    // Unknown types become notes with every field listed.
    const card = byName(items, "Visa");
    expect(card.type).toBe("SECURE_NOTE");
    expect(card.secret).toEqual({
      content:
        "Bitwarden card\n\nCardholder name: Jane Doe\nBrand: Visa\nNumber: 4111111111111111\n" +
        "Exp month: 4\nExp year: 2030\nCode: 123",
    });
    expect((byName(items, "Me").secret as { content: string }).content).toContain(
      "First name: Jane"
    );
    // No name: named after the URL's host.
    expect(byName(items, "news.example.test").type).toBe("LOGIN");

    expect(skipped).toEqual([{ row: 7, reason: "Not an item" }]);
  });

  it("refuses an encrypted Bitwarden export", async () => {
    await expect(
      parseImportFile("bitwarden-json", '{"encrypted": true, "items": []}')
    ).rejects.toThrow(/encrypted/);
    await expect(parseImportFile("bitwarden-json", "[1,2]")).rejects.toBeInstanceOf(
      ImportFormatError
    );
  });
});

describe("Bitwarden CSV", () => {
  it("handles quoting, multi-line notes, several URIs and typed notes", async () => {
    const { items, skipped } = await parseImportFile("bitwarden-csv", fixture("bitwarden.csv"));
    expect(items).toHaveLength(3);
    expect(byName(items, "GitHub")).toEqual({
      type: "LOGIN",
      name: "GitHub",
      favorite: true,
      secret: {
        username: "octocat",
        password: 'pa,ss"word',
        url: "https://github.com",
        notes:
          "Line one\r\nLine two\n\nOther URLs: https://gist.github.com\nTOTP: JBSWY3DPEHPK3PXP\n" +
          "Recovery email: me@example.test",
      },
    });
    expect(byName(items, "Door codes")).toMatchObject({
      type: "SECURE_NOTE",
      secret: { content: "Front: 1234" },
    });
    // KeyCrypt's own CSV export of a WiFi item round-trips to a WiFi item.
    expect(byName(items, "Home WiFi")).toEqual({
      type: "WIFI_PASSWORD",
      name: "Home WiFi",
      favorite: false,
      secret: { ssid: "HomeNet", password: "hunter22", securityType: "WPA3", notes: "" },
    });
    // The fully empty last row is ignored.
    expect(skipped).toEqual([{ row: 4, reason: "Unsupported Bitwarden type “card”" }]);
  });

  it("rejects a CSV from another app", async () => {
    await expect(parseImportFile("bitwarden-csv", fixture("chrome.csv"))).rejects.toThrow(
      /Bitwarden CSV/
    );
  });
});

describe("1Password CSV", () => {
  it("maps logins and notes, keeping OTP and tags in the notes", async () => {
    const { items, skipped } = await parseImportFile("1password-csv", fixture("1password.csv"));
    expect(items).toEqual([
      {
        type: "LOGIN",
        name: "Amazon",
        favorite: true,
        secret: {
          username: "shopper@example.test",
          password: "Amaz0n!pw",
          url: "https://www.amazon.com",
          notes: "Tags: Shopping",
        },
      },
      {
        type: "LOGIN",
        name: "Bank",
        favorite: false,
        secret: {
          username: "jdoe",
          password: "b@nk, pw",
          url: "https://bank.example.test",
          notes:
            "Call 555-0100\n\nTOTP: otpauth://totp/Bank:jdoe?secret=GEZDGNBVGY3TQOJQ&issuer=Bank",
        },
      },
      {
        type: "SECURE_NOTE",
        name: "Wifi notes",
        favorite: false,
        secret: { content: "Router admin is on the sticker" },
      },
    ]);
    expect(skipped).toEqual([]);
  });
});

describe("LastPass CSV", () => {
  it("maps logins and http://sn secure notes", async () => {
    const { items, skipped } = await parseImportFile("lastpass-csv", fixture("lastpass.csv"));
    expect(items).toEqual([
      {
        type: "LOGIN",
        name: "Twitter",
        favorite: true,
        secret: {
          username: "jack",
          password: "tw!tter1",
          url: "https://twitter.com",
          notes: "Folder: Social",
        },
      },
      {
        type: "SECURE_NOTE",
        name: "DB server",
        favorite: false,
        secret: {
          content: "NoteType:Server\nHostname:db.internal\nUsername:admin\n\nFolder: Infra",
        },
      },
      {
        type: "LOGIN",
        name: "Mail",
        favorite: false,
        secret: {
          username: "me",
          password: "m@il-pw",
          url: "https://mail.example.test",
          notes: "backup codes in safe\n\nTOTP: JBSWY3DPEHPK3PXP",
        },
      },
    ]);
    expect(skipped).toEqual([]);
  });
});

describe("Chrome / Edge CSV", () => {
  it("maps every row with a password to a login", async () => {
    const { items, skipped } = await parseImportFile("chrome-csv", fixture("chrome.csv"));
    expect(items).toEqual([
      {
        type: "LOGIN",
        name: "accounts.google.com",
        favorite: false,
        secret: {
          username: "jane@example.test",
          password: "G00gle-pw",
          url: "https://accounts.google.com/signin",
          notes: "",
        },
      },
      {
        type: "LOGIN",
        name: "example.test",
        favorite: false,
        secret: {
          username: "jane",
          password: "pw,with,commas",
          url: "https://example.test/login",
          notes: "personal",
        },
      },
    ]);
    expect(skipped).toEqual([{ row: 3, reason: "No password" }]);
  });

  it("keeps row numbers after blank lines", async () => {
    const { skipped } = await parseImportFile(
      "chrome-csv",
      "name,url,username,password\na,https://a.test,u,p\n\n,,,\nb,https://b.test,u,\n"
    );
    expect(skipped).toEqual([{ row: 4, reason: "No password" }]);
  });

  it("works without the note column (Edge)", async () => {
    const { items } = await parseImportFile(
      "chrome-csv",
      "name,url,username,password\nsite,https://site.test,u,p\n"
    );
    expect(items[0]?.secret).toEqual({
      username: "u",
      password: "p",
      url: "https://site.test",
      notes: "",
    });
  });
});

describe("KeyCrypt encrypted export", () => {
  it("decrypts with the export password and restores every type", async () => {
    const { items, skipped } = await parseImportFile(
      "keycrypt-export",
      fixture("keycrypt-export.json"),
      "fixture-export-password"
    );
    expect(skipped).toEqual([]);
    expect(items).toEqual([
      {
        type: "LOGIN",
        name: "GitHub",
        favorite: true,
        secret: {
          username: "octocat",
          password: "gh-S3cret-Pa55!",
          url: "https://github.com",
          notes: "work",
        },
      },
      {
        type: "SECURE_NOTE",
        name: "Recovery codes",
        favorite: false,
        secret: { content: "alpha-bravo-charlie\n12345-67890" },
      },
      {
        type: "API_KEY",
        name: "OpenWeather",
        favorite: false,
        secret: { key: "ow-key-123", description: "Weather widget", notes: "" },
      },
      {
        type: "WIFI_PASSWORD",
        name: "Home WiFi",
        favorite: false,
        secret: { ssid: "HomeNet", password: "hunter22-wifi", securityType: "WPA3", notes: "" },
      },
    ]);
  });

  it("rejects a wrong export password", async () => {
    await expect(
      parseImportFile("keycrypt-export", fixture("keycrypt-export.json"), "wrong-password-123")
    ).rejects.toBeInstanceOf(ExportDecryptionError);
    await expect(
      parseImportFile("keycrypt-export", fixture("keycrypt-export.json"))
    ).rejects.toBeInstanceOf(ImportFormatError);
  });
});

describe("limits", () => {
  it("skips entries that exceed the item limits, and shortens long names", async () => {
    const longNotes = "x".repeat(10_001);
    const csv = `name,url,username,password,note\n${"n".repeat(150)},https://a.test,u,p,\nb,https://b.test,u,p,${longNotes}\n`;
    const { items, skipped } = await parseImportFile("chrome-csv", csv);
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toHaveLength(100);
    expect(skipped).toEqual([{ row: 2, reason: "Notes: Max 10,000 characters" }]);
  });
});
