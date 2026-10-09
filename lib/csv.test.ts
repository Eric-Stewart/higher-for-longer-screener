import { describe, expect, it } from "vitest";
import { parseCsv, parseIwmHoldings, parseTickerUpload } from "./csv";
describe("CSV parsing", () => {
  it("handles quoted commas, escaped quotes, CRLF, and blank rows", () => {
    expect(
      parseCsv('Ticker,Name\r\nABC,"Acme, Inc."\r\nQX,"Said ""yes"""\r\n\r\n'),
    ).toEqual([
      ["Ticker", "Name"],
      ["ABC", "Acme, Inc."],
      ["QX", 'Said "yes"'],
    ]);
  });
  it("finds an iShares header after metadata and excludes cash rows", () => {
    const csv =
      'Fund Holdings as of,"Oct 1, 2026"\n\nTicker,Name,Sector,Asset Class\nABC,Acme,Industrials,Equity\n-,USD CASH,Cash and/or Derivatives,Cash';
    expect(parseIwmHoldings(csv)).toEqual([
      { ticker: "ABC", name: "Acme", sector: "Industrials" },
    ]);
  });
  it("accepts ticker-only and header uploads and deduplicates", () => {
    expect(
      parseTickerUpload("ticker,name\na.b,Alpha\nA.B,Again\nxyz,XYZ Co"),
    ).toEqual([
      { ticker: "A-B", name: "Alpha" },
      { ticker: "XYZ", name: "XYZ Co" },
    ]);
  });
});
