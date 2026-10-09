import { describe, expect, it } from "vitest";
import { parseScreenRequest, parseTickerIdentifier } from "./screen-request";

describe("screen request validation", () => {
  it("normalizes supported ticker identifiers and rejects malformed ones", () => {
    expect(parseTickerIdentifier("brk.b")).toBe("BRK-B");
    expect(() => parseTickerIdentifier("AAPL!!!")).toThrow("unsupported");
  });

  it("accepts valid unique string tickers and default thresholds", () => {
    const parsed = parseScreenRequest({ tickers: ["acls", "ACLS", "brk.b"] });
    expect(parsed.tickers).toEqual(["ACLS", "BRK-B"]);
    expect(parsed.thresholds.marketCapMin).toBe(200_000_000);
  });

  it("rejects non-string identifiers instead of coercing them", () => {
    expect(() => parseScreenRequest({ tickers: [123] })).toThrow("strings");
  });

  it("rejects requests above the bounded 20-ticker limit", () => {
    expect(() =>
      parseScreenRequest({
        tickers: Array.from({ length: 21 }, (_, i) => `T${i}`),
      }),
    ).toThrow("20");
  });

  it("rejects non-finite, out-of-range, unknown, and incoherent thresholds", () => {
    expect(() =>
      parseScreenRequest({
        tickers: ["ACLS"],
        thresholds: { operatingMarginMin: Number.NaN },
      }),
    ).toThrow("finite");
    expect(() =>
      parseScreenRequest({
        tickers: ["ACLS"],
        thresholds: { debtToEquityMax: -1 },
      }),
    ).toThrow("range");
    expect(() =>
      parseScreenRequest({ tickers: ["ACLS"], thresholds: { madeUp: 1 } }),
    ).toThrow("Unknown");
    expect(() =>
      parseScreenRequest({
        tickers: ["ACLS"],
        thresholds: {
          marketCapMin: 5_000_000_000,
          marketCapMax: 1_000_000_000,
        },
      }),
    ).toThrow("less than");
  });
});
