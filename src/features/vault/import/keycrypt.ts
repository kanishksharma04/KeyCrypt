import { decryptExport, EXPORT_FORMAT } from "@/lib/crypto";
import type { VaultExportPayload } from "@/lib/vault-export";
import { ImportCollector, asWifiSecurity, importedTotp, str } from "./normalize";
import { ImportFormatError, type ImportResult } from "./types";

// KeyCrypt's own password-protected export (Settings → Export, "keycrypt-export" v1).
// Decrypted here with the export password; throws ExportDecryptionError if wrong.

/** Rebuild an otpauth:// link from a stored OTP secret's fields (validated afterwards). */
function totpUriFromSecret(s: Record<string, unknown>): string {
  const q = new URLSearchParams({
    secret: str(s.secret),
    algorithm: str(s.algorithm) || "SHA1",
    digits: str(s.digits) || "6",
    period: str(s.period) || "30",
  });
  return `otpauth://totp/x?${q.toString()}`;
}

export function isKeyCryptExport(text: string): boolean {
  try {
    return (JSON.parse(text) as { format?: unknown })?.format === EXPORT_FORMAT;
  } catch {
    return false;
  }
}

export async function parseKeyCryptExport(
  text: string,
  exportPassword: string
): Promise<ImportResult> {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new ImportFormatError("The file isn't valid JSON.");
  }
  const payload = await decryptExport<Partial<VaultExportPayload>>(file, exportPassword);
  if (!payload || !Array.isArray(payload.items)) {
    throw new ImportFormatError("The export is empty or damaged.");
  }

  const out = new ImportCollector();
  payload.items.forEach((raw: unknown, i) => {
    const row = i + 1;
    const item = (raw ?? {}) as {
      type?: unknown;
      name?: unknown;
      favorite?: unknown;
      folder?: unknown;
      secret?: unknown;
    };
    const s = (item.secret ?? {}) as Record<string, unknown>;
    const name = str(item.name);
    const favorite = item.favorite === true;
    // Exports made before folders were included have no folder.
    const folder = str(item.folder);
    switch (item.type) {
      case "LOGIN":
        return out.add(
          row,
          {
            type: "LOGIN",
            name,
            favorite,
            secret: {
              username: str(s.username),
              password: str(s.password),
              url: str(s.url),
              notes: str(s.notes),
              ...(str(s.totp) && { totp: str(s.totp) }),
            },
          },
          folder
        );
      case "SECURE_NOTE":
        return out.add(
          row,
          {
            type: "SECURE_NOTE",
            name,
            favorite,
            secret: { content: str(s.content) },
          },
          folder
        );
      case "API_KEY":
        return out.add(
          row,
          {
            type: "API_KEY",
            name,
            favorite,
            secret: { key: str(s.key), description: str(s.description), notes: str(s.notes) },
          },
          folder
        );
      case "WIFI_PASSWORD":
        return out.add(
          row,
          {
            type: "WIFI_PASSWORD",
            name,
            favorite,
            secret: {
              ssid: str(s.ssid),
              password: str(s.password),
              securityType: asWifiSecurity(str(s.securityType)),
              notes: str(s.notes),
            },
          },
          folder
        );
      case "OTP_SECRET": {
        const params = importedTotp(totpUriFromSecret(s));
        if (!params) return out.skip(row, "Damaged authenticator key");
        return out.add(
          row,
          {
            type: "OTP_SECRET",
            name,
            favorite,
            secret: {
              ...params,
              issuer: str(s.issuer),
              account: str(s.account),
              notes: str(s.notes),
            },
          },
          folder
        );
      }
      default:
        return out.skip(row, `Unknown item type “${str(item.type) || "(none)"}”`);
    }
  });
  return out.done();
}
