import { describe, expect, it } from "vitest";
import { csvCell, taka, toCsv } from "./csv";

describe("taka (Reports F7)", () => {
  it("prints taka with two decimals and no grouping", () => {
    expect(taka(630000)).toBe("6300.00");
    expect(taka(29224070)).toBe("292240.70");
    expect(taka(5)).toBe("0.05");
    expect(taka(0)).toBe("0.00");
    expect(taka(-500000)).toBe("-5000.00");
  });
});

describe("csvCell", () => {
  it("quotes commas, quotes and line breaks (RFC 4180)", () => {
    expect(csvCell("DESCO, Mirpur")).toBe('"DESCO, Mirpur"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("plain")).toBe("plain");
  });

  it("guards text that a spreadsheet would run as a formula", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+88017")).toBe("'+88017");
    expect(csvCell("-x")).toBe("'-x");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("\tx")).toBe("'\tx");
    expect(csvCell("=a,b")).toBe(`"'=a,b"`);
  });

  it("leaves numbers and empty values alone", () => {
    expect(csvCell(-12)).toBe("-12");
    expect(csvCell(taka(-500000))).toBe("-5000.00");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell("")).toBe("");
  });
});

describe("toCsv", () => {
  it("starts with a UTF-8 BOM and ends every row with CRLF", () => {
    expect(toCsv([["Date", "Amount"], ["2026-10-05", "6300.00"], []])).toBe("﻿Date,Amount\r\n2026-10-05,6300.00\r\n\r\n");
  });
});
