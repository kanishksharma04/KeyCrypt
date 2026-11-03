import { describe, expect, it } from "vitest";
import type { DecryptedVaultItem } from "@/types/vault";
import {
  BITWARDEN_CSV_COLUMNS,
  buildExportPayload,
  exportFilename,
  toBitwardenCsv,
} from "../vault-export";

const T = { createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z" };
const ITEMS: DecryptedVaultItem[] = [
  {
    ...T,
    id: "c1",
    type: "LOGIN",
    name: "GitHub, Inc.",
    favorite: true,
    secret: { username: "octocat", password: 'pa"ss', url: "https://github.com", notes: "a\nb" },
  },
  {
    ...T,
    id: "c2",
    type: "SECURE_NOTE",
    name: "Codes",
    favorite: false,
    secret: { content: "1234" },
  },
  {
    ...T,
    id: "c3",
    type: "API_KEY",
    name: "Stripe",
    favorite: false,
    secret: { key: "sk_123", description: "billing", notes: "" },
  },
  {
    ...T,
    id: "c4",
    type: "WIFI_PASSWORD",
    name: "Home",
    favorite: false,
    secret: { ssid: "Net", password: "wifipw", securityType: "WPA3", notes: "router" },
  },
];

/** Minimal RFC 4180 parser for checking the output. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r" && text[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += c;
    }
  }
  return rows;
}

describe("toBitwardenCsv", () => {
  const rows = parseCsv(toBitwardenCsv(ITEMS));
  const header = rows[0]!;
  const byName = (name: string) => {
    const r = rows.find((row) => row[header.indexOf("name")] === name)!;
    return Object.fromEntries(header.map((h, i) => [h, r[i]]));
  };

  it("uses Bitwarden's column order", () => {
    expect(header).toEqual([...BITWARDEN_CSV_COLUMNS]);
    expect(rows).toHaveLength(1 + ITEMS.length);
  });

  it("maps logins to login rows, escaping commas, quotes and newlines", () => {
    expect(byName("GitHub, Inc.")).toMatchObject({
      type: "login",
      favorite: "1",
      login_username: "octocat",
      login_password: 'pa"ss',
      login_uri: "https://github.com",
      notes: "a\nb",
      reprompt: "0",
    });
  });

  it("maps notes, API keys and WiFi to note rows with custom fields", () => {
    expect(byName("Codes")).toMatchObject({ type: "note", notes: "1234", favorite: "" });
    expect(byName("Stripe")).toMatchObject({
      type: "note",
      fields: "API key: sk_123\nDescription: billing",
    });
    expect(byName("Home")).toMatchObject({
      type: "note",
      notes: "router",
      fields: "SSID: Net\nPassword: wifipw\nSecurity: WPA3",
    });
  });
});

describe("toBitwardenCsv: authenticator codes", () => {
  it("exports a login's TOTP link and an authenticator as a login with login_totp, and both re-import", async () => {
    const { parseImportFile } = await import("@/features/vault/import");
    const uri =
      "otpauth://totp/GitHub:octocat?issuer=GitHub&secret=JBSWY3DPEHPK3PXP&algorithm=SHA1&digits=6&period=30";
    const csv = toBitwardenCsv([
      {
        ...T,
        id: "o1",
        type: "LOGIN",
        name: "GitHub",
        favorite: false,
        secret: {
          username: "octocat",
          password: "pw",
          url: "https://github.com",
          notes: "",
          totp: uri,
        },
      },
      {
        ...T,
        id: "o2",
        type: "OTP_SECRET",
        name: "Bank 2FA",
        favorite: false,
        secret: {
          secret: "HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ",
          issuer: "Bank",
          account: "jo",
          algorithm: "SHA256",
          digits: 8,
          period: 60,
          notes: "n",
        },
      },
    ]);
    expect(csv).toContain(uri);
    expect(csv).toContain("secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ");

    const { items } = await parseImportFile("bitwarden-csv", csv);
    expect(items[0]).toMatchObject({ type: "LOGIN", secret: { totp: uri } });
    // An authenticator with an account comes back as a login holding the key.
    expect(items[1]).toMatchObject({
      type: "LOGIN",
      name: "Bank 2FA",
      secret: { username: "jo", notes: "n" },
    });
    expect((items[1]?.secret as { totp?: string }).totp).toContain("algorithm=SHA256");
  });
});

describe("buildExportPayload", () => {
  it("keeps every item's content but drops server ids", () => {
    const payload = buildExportPayload(ITEMS, new Date("2026-10-31T22:16:00Z"));
    expect(payload.exportedAt).toBe("2026-10-31T22:16:00.000Z");
    expect(payload.items).toHaveLength(4);
    expect(payload.items[0]).toEqual({
      type: "LOGIN",
      name: "GitHub, Inc.",
      favorite: true,
      ...T,
      secret: ITEMS[0]!.secret,
    });
    expect(JSON.stringify(payload)).not.toContain('"id"');
  });
});

describe("exportFilename", () => {
  it("dates the file and picks the extension", () => {
    const d = new Date("2026-10-31T22:16:00Z");
    expect(exportFilename("encrypted-json", d)).toBe("keycrypt-export-2026-10-31.json");
    expect(exportFilename("csv", d)).toBe("keycrypt-export-2026-10-31.csv");
  });
});
