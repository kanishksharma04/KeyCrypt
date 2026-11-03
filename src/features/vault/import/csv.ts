import Papa from "papaparse";
import { ImportFormatError } from "./types";

export interface CsvTable {
  /** Lower-cased, trimmed header names. */
  headers: string[];
  /**
   * [record number (1-based, header excluded), cells keyed by lower-cased
   * header]. Fully empty records are dropped but still counted, so the numbers
   * shown in the preview match the file.
   */
  rows: Array<[number, Record<string, string>]>;
}

/** Parse CSV text with a header row (RFC 4180 quoting, any line ending, BOM ok). */
export function parseCsv(text: string): CsvTable {
  const result = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: false,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const headers = (result.meta.fields ?? []).filter(Boolean);
  if (headers.length === 0) throw new ImportFormatError("The file has no header row.");
  const rows: CsvTable["rows"] = [];
  result.data.forEach((row, i) => {
    const out: Record<string, string> = {};
    for (const h of headers) out[h] = typeof row[h] === "string" ? row[h] : "";
    if (Object.values(out).some((v) => v.trim() !== "")) rows.push([i + 1, out]);
  });
  return { headers, rows };
}

/** Throw unless every column is present (lower-case names). */
export function requireColumns(table: CsvTable, columns: string[], formatName: string): void {
  const missing = columns.filter((c) => !table.headers.includes(c));
  if (missing.length > 0) {
    throw new ImportFormatError(
      `This doesn't look like a ${formatName} export (missing column: ${missing.join(", ")}).`
    );
  }
}

/** The first column present among `aliases`, or "". */
export function cell(row: Record<string, string>, ...aliases: string[]): string {
  for (const a of aliases) {
    const v = row[a];
    if (v !== undefined) return v;
  }
  return "";
}
