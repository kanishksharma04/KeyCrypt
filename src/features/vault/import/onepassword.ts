import { cell, parseCsv } from "./csv";
import { fieldLines, ImportCollector, itemName, joinNotes, loginOrNote, truthy } from "./normalize";
import { ImportFormatError, type ImportResult } from "./types";

// 1Password CSV (1Password 8: Title, Url, Username, Password, OTPAuth, Favorite,
// Archived, Tags, Notes; 1Password 7 used "title", "website", "notesPlain", ...).

export function parseOnePasswordCsv(text: string): ImportResult {
  const table = parseCsv(text);
  const has = (...names: string[]) => names.some((n) => table.headers.includes(n));
  if (!has("title") || !has("password")) {
    throw new ImportFormatError(
      "This doesn't look like a 1Password CSV export (needs Title and Password columns)."
    );
  }

  const out = new ImportCollector();
  table.rows.forEach(([row, r]) => {
    const url = cell(r, "url", "website", "login url", "urls");
    const login = {
      username: cell(r, "username", "user name"),
      password: cell(r, "password"),
      url: url.split(/\r?\n/)[0]?.trim() ?? "",
      notes: joinNotes(
        cell(r, "notes", "notesplain"),
        fieldLines([
          ["TOTP", cell(r, "otpauth", "one-time password")],
          ["Tags", cell(r, "tags")],
        ])
      ),
    };
    const title = cell(r, "title");
    if (!title && !login.username && !login.password && !login.url && !login.notes) {
      return out.skip(row, "Empty row");
    }
    out.add(row, loginOrNote(itemName(title, login.url), truthy(cell(r, "favorite")), login));
  });
  return out.done();
}
