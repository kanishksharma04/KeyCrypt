import { cell, parseCsv, requireColumns } from "./csv";
import {
  fieldLines,
  flattenFields,
  ImportCollector,
  itemName,
  joinNotes,
  loginOrNote,
  noteOrTypedItem,
  parseFieldLines,
  str,
  truthy,
} from "./normalize";
import { ImportFormatError, type ImportResult } from "./types";

// Bitwarden: unencrypted JSON ("File format: .json") and CSV exports.

const BITWARDEN_TYPES: Record<number, string> = {
  3: "Card",
  4: "Identity",
  5: "SSH key",
};

/** Extra URLs (beyond the first), kept in the notes. */
function loginExtras(urls: string[]): Array<[string, string]> {
  return urls.length > 1 ? [["Other URLs", urls.slice(1).join(", ")]] : [];
}

interface BitwardenJsonItem {
  type?: unknown;
  name?: unknown;
  notes?: unknown;
  favorite?: unknown;
  login?: { username?: unknown; password?: unknown; totp?: unknown; uris?: unknown };
  fields?: unknown;
  card?: unknown;
  identity?: unknown;
  sshKey?: unknown;
}

export function parseBitwardenJson(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportFormatError("The file isn't valid JSON.");
  }
  const root = data as { encrypted?: unknown; passwordProtected?: unknown; items?: unknown };
  if (root?.encrypted === true || root?.passwordProtected === true) {
    throw new ImportFormatError(
      "This Bitwarden export is encrypted. Export again with the file format “.json” (unencrypted)."
    );
  }
  if (!root || !Array.isArray(root.items)) {
    throw new ImportFormatError("This doesn't look like a Bitwarden JSON export.");
  }

  const out = new ImportCollector();
  root.items.forEach((raw: unknown, i) => {
    const row = i + 1;
    if (!raw || typeof raw !== "object") return out.skip(row, "Not an item");
    const item = raw as BitwardenJsonItem;
    const notes = str(item.notes);
    const favorite = item.favorite === true;
    const fields: Array<[string, string]> = Array.isArray(item.fields)
      ? item.fields
          .map((f: { name?: unknown; value?: unknown }): [string, string] => [
            str(f?.name) || "Field",
            str(f?.value),
          ])
          .filter(([, v]) => v !== "")
      : [];

    switch (item.type) {
      case 1: {
        const login = item.login ?? {};
        const urls = Array.isArray(login.uris)
          ? login.uris.map((u: { uri?: unknown }) => str(u?.uri)).filter(Boolean)
          : [];
        const url = urls[0] ?? "";
        return out.add(
          row,
          loginOrNote(itemName(str(item.name), url), favorite, {
            username: str(login.username),
            password: str(login.password),
            url,
            notes: joinNotes(notes, fieldLines([...loginExtras(urls), ...fields])),
            totp: str(login.totp),
          })
        );
      }
      case 2:
        return out.add(row, noteOrTypedItem(itemName(str(item.name)), favorite, notes, fields));
      default: {
        const kind = BITWARDEN_TYPES[Number(item.type)] ?? "Item";
        const details = flattenFields(item.card ?? item.identity ?? item.sshKey);
        if (!str(item.name) && details.length === 0 && !notes) {
          return out.skip(row, "Empty item");
        }
        return out.add(row, {
          type: "SECURE_NOTE",
          name: itemName(str(item.name), "", kind),
          favorite,
          secret: {
            content: joinNotes(
              `Bitwarden ${kind.toLowerCase()}`,
              fieldLines(details),
              notes,
              fieldLines(fields)
            ),
          },
        });
      }
    }
  });
  return out.done();
}

export function parseBitwardenCsv(text: string): ImportResult {
  const table = parseCsv(text);
  requireColumns(table, ["type", "name", "login_password"], "Bitwarden CSV");

  const out = new ImportCollector();
  table.rows.forEach(([row, r]) => {
    const notes = cell(r, "notes");
    const favorite = truthy(cell(r, "favorite"));
    const fields = parseFieldLines(cell(r, "fields"));
    const type = cell(r, "type").trim().toLowerCase();

    if (type === "login") {
      const urls = cell(r, "login_uri")
        .split(/,(?=\s*[a-z][a-z0-9+.-]*:)/i) // several URIs are comma-separated
        .map((u) => u.trim())
        .filter(Boolean);
      const url = urls[0] ?? "";
      return out.add(
        row,
        loginOrNote(itemName(cell(r, "name"), url), favorite, {
          username: cell(r, "login_username"),
          password: cell(r, "login_password"),
          url,
          notes: joinNotes(notes, fieldLines([...loginExtras(urls), ...fields])),
          totp: cell(r, "login_totp"),
        })
      );
    }
    if (type === "note") {
      return out.add(row, noteOrTypedItem(itemName(cell(r, "name")), favorite, notes, fields));
    }
    if (!cell(r, "name") && !notes && fields.length === 0) return out.skip(row, "Empty row");
    return out.skip(row, `Unsupported Bitwarden type “${type || "(none)"}”`);
  });
  return out.done();
}
