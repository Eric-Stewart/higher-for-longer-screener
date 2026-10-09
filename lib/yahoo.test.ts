import { describe, expect, it } from "vitest";
import { parseYahooChart } from "./yahoo";

function payload(
  closes: (number | null)[],
  volumes: (number | null)[],
  adj?: (number | null)[],
) {
  const start = Date.UTC(2026, 8, 1) / 1000;
  return {
    chart: {
      result: [
        {
          meta: { symbol: "ACLS", exchangeTimezoneName: "America/New_York" },
          timestamp: closes.map((_, i) => start + i * 86400),
          indicators: {
            quote: [
              {
                open: closes.map(() => null),
                high: closes.map(() => null),
                low: closes.map(() => null),
                close: closes,
                volume: volumes,
              },
            ],
            adjclose: adj ? [{ adjclose: adj }] : undefined,
          },
        },
      ],
      error: null,
    },
  };
}

describe("Yahoo", () => {
  it("uses the latest 20 valid ascending daily sessions", () => {
    const closes = Array.from({ length: 22 }, (_, i) => i + 1);
    const volumes = Array.from({ length: 22 }, (_, i) => 1000 + i);
    const r = parseYahooChart(payload(closes, volumes), "url");
    expect(r.latestClose.value).toBe(22);
    const expected =
      Array.from({ length: 20 }, (_, i) => (i + 3) * (1002 + i)).reduce(
        (a, b) => a + b,
        0,
      ) / 20;
    expect(r.avgDollarVolume.value).toBeCloseTo(expected);
    expect(r.asOf).toBe("2026-09-22");
  });
  it("applies the adjclose ratio when present", () => {
    const closes = Array.from({ length: 22 }, (_, i) => i + 1);
    const volumes = Array.from({ length: 22 }, (_, i) => 1000 + i);
    const adj = closes.map((c) => c * 0.5);
    const r = parseYahooChart(payload(closes, volumes, adj), "url");
    expect(r.latestClose.value).toBeCloseTo(11);
  });
  it("reports Yahoo error payloads", () => {
    const r = parseYahooChart(
      { chart: { result: null, error: { description: "No data found" } } },
      "url",
    );
    expect(r.latestClose.value).toBeNull();
    expect(r.latestClose.reason).toContain("No data found");
  });
  it("skips null sessions and reports insufficient history", () => {
    const r = parseYahooChart(
      payload([null, null], [null, null]),
      "url",
    );
    expect(r.latestClose.value).toBeNull();
    expect(r.avgDollarVolume.reason).toContain("No valid");
  });
});
