import { cell, parseCsv, requireColumns } from "./csv";
import { ImportCollector, itemName } from "./normalize";
import type { ImportResult } from "./types";

// Chrome / Edge "Export passwords" CSV: name, url, username, password[, note].

export function parseChromeCsv(text: string): ImportResult {
  const table = parseCsv(text);
  requireColumns(table, ["url", "username", "password"], "Chrome or Edge CSV");

  const out = new ImportCollector();
  table.rows.forEach(([row, r]) => {
    const url = cell(r, "url").trim();
    const username = cell(r, "username");
    const password = cell(r, "password");
    if (!url && !username && !password) return out.skip(row, "Empty row");
    if (!password) return out.skip(row, "No password");
    out.add(row, {
      type: "LOGIN",
      name: itemName(cell(r, "name"), url),
      favorite: false,
      secret: { username, password, url, notes: cell(r, "note", "notes") },
    });
  });
  return out.done();
}
