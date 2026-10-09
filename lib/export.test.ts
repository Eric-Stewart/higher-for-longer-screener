import { describe, expect, it } from "vitest";
import { resultsToCsv } from "./export";
import type { ScoredCompany } from "./types";

describe("CSV export", () => {
  it("exports every scored factor with provenance and explicit N/A reasons", () => {
    const metric = (value: number | null, reason?: string) => ({
      value,
      sourceUrl: "https://example.test/fact",
      asOf: value === null ? null : "2026-09-30",
      reason,
    });
    const breakdown = [
      {
        key: "netIncome",
        label: "Net income",
        value: null,
        threshold: "> $0M",
        weight: 12,
        points: 0,
        passed: null,
        reason: "No usable fact",
      },
    ];
    const row = {
      ticker: "TEST",
      name: "Test Co",
      score: 0,
      passedAll: false,
      missingCount: 1,
      availableWeight: 88,
      breakdown,
      synthetic: false,
      netIncome: metric(null, "No usable fact"),
      operatingMargin: metric(0.1),
      debtToEquity: metric(0.2),
      interestCoverage: metric(6),
      freeCashFlow: metric(2),
      freeCashFlowMargin: metric(0.04),
      marketCap: metric(500_000_000),
      avgDollarVolume: metric(2_000_000),
    } as unknown as ScoredCompany;
    const csv = resultsToCsv([row]);
    expect(csv).toContain("Net income");
    expect(csv).toContain("Interest coverage");
    expect(csv).toContain("FCF margin");
    expect(csv).toContain("N/A: No usable fact");
    expect(csv).toContain("https://example.test/fact");
    expect(csv).toContain("2026-09-30");
    expect(csv).toContain("> $0M");
  });

  it("quotes formula-like and comma values to prevent spreadsheet injection", () => {
    const row = {
      ticker: "=BAD",
      name: "Smith, Inc.",
      score: 88,
      passedAll: false,
      missingCount: 1,
      availableWeight: 88,
      breakdown: [],
      synthetic: true,
    } as unknown as ScoredCompany;
    const csv = resultsToCsv([row]);
    expect(csv).toContain('"\'=BAD"');
    expect(csv).toContain('"Smith, Inc."');
    expect(csv.split("\n")).toHaveLength(2);
  });
});
