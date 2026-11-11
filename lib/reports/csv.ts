// CSV for report exports (Reports PRD F7): taka with 2 decimals, English
// headers, RFC 4180 quoting, a formula-injection guard on text cells and a
// UTF-8 BOM so spreadsheets read Bangla names correctly. Pure.

export type CsvValue = string | number | null | undefined;

/** 630000 → "6300.00"; −500000 → "-5000.00". */
export function taka(paisa: number): string {
  const abs = Math.abs(paisa);
  return `${paisa < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const FORMULA = /^[=+\-@\t\r]/;
const NUMBER = /^-?\d+(\.\d+)?$/;

export function csvCell(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  const text = FORMULA.test(v) && !NUMBER.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: readonly (readonly CsvValue[])[]): string {
  return `﻿${rows.map((r) => `${r.map(csvCell).join(",")}\r\n`).join("")}`;
}
