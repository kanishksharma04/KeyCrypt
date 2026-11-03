import { cell, parseCsv, requireColumns } from "./csv";
import { fieldLines, ImportCollector, itemName, joinNotes, truthy } from "./normalize";
import type { ImportResult } from "./types";

// LastPass CSV: url, username, password, totp, extra, name, grouping, fav.
// Secure notes have the URL "http://sn"; their text is in "extra".

const SECURE_NOTE_URL = "http://sn";

export function parseLastPassCsv(text: string): ImportResult {
  const table = parseCsv(text);
  requireColumns(table, ["url", "username", "password", "extra", "name"], "LastPass CSV");

  const out = new ImportCollector();
  table.rows.forEach(([row, r]) => {
    const url = cell(r, "url").trim();
    const name = cell(r, "name");
    const extra = cell(r, "extra");
    const favorite = truthy(cell(r, "fav"));
    const folder = fieldLines([["Folder", cell(r, "grouping")]]);

    if (url === SECURE_NOTE_URL) {
      return out.add(row, {
        type: "SECURE_NOTE",
        name: itemName(name, "", "Secure note"),
        favorite,
        secret: { content: joinNotes(extra, folder) },
      });
    }
    const username = cell(r, "username");
    const password = cell(r, "password");
    if (!name && !url && !username && !password && !extra) return out.skip(row, "Empty row");
    out.add(row, {
      type: "LOGIN",
      name: itemName(name, url),
      favorite,
      secret: {
        username,
        password,
        url,
        notes: joinNotes(extra, fieldLines([["TOTP", cell(r, "totp")]]), folder),
      },
    });
  });
  return out.done();
}
