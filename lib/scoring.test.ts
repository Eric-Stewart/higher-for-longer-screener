import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, scoreCompany } from "./scoring";
import type { CompanyMetrics } from "./types";
const metric = (value: number | null, reason?: string) => ({
  value,
  sourceUrl: "https://example.test",
  asOf: "2026-09-30",
  reason,
});
const base: CompanyMetrics = {
  ticker: "TEST",
  name: "Test Co",
  synthetic: false,
  netIncome: metric(1),
  operatingMargin: metric(0.051),
  debtToEquity: metric(0.49),
  interestCoverage: metric(4.01),
  freeCashFlow: metric(1),
  freeCashFlowMargin: metric(0.031),
  marketCap: metric(200_000_001),
  avgDollarVolume: metric(1_000_001),
};
describe("scoring", () => {
  it("awards 100 only when every strict/default boundary passes", () => {
    const r = scoreCompany(base, DEFAULT_THRESHOLDS);
    expect(r.score).toBe(100);
    expect(r.passedAll).toBe(true);
    expect(r.availableWeight).toBe(100);
  });
  it("treats exact boundaries as failures for strict inequalities", () => {
    const r = scoreCompany(
      {
        ...base,
        netIncome: metric(0),
        operatingMargin: metric(0.05),
        debtToEquity: metric(0.5),
        interestCoverage: metric(4),
        freeCashFlow: metric(0),
        freeCashFlowMargin: metric(0.03),
        marketCap: metric(200_000_000),
        avgDollarVolume: metric(1_000_000),
      },
      DEFAULT_THRESHOLDS,
    );
    expect(r.score).toBe(12);
    expect(r.breakdown.find((x) => x.key === "marketCap")?.passed).toBe(true);
  });
  it("does not silently drop missing values or renormalize score", () => {
    const r = scoreCompany(
      { ...base, interestCoverage: metric(null, "No interest expense fact") },
      DEFAULT_THRESHOLDS,
    );
    expect(r.score).toBe(88);
    expect(r.availableWeight).toBe(88);
    expect(r.missingCount).toBe(1);
    expect(
      r.breakdown.find((x) => x.key === "interestCoverage")?.reason,
    ).toContain("No interest");
  });
  it("explains the active thresholds instead of stale defaults", () => {
    const r = scoreCompany(base, {
      ...DEFAULT_THRESHOLDS,
      operatingMarginMin: 0.08,
      debtToEquityMax: 0.35,
      marketCapMin: 300_000_000,
      marketCapMax: 4_000_000_000,
    });
    expect(
      r.breakdown.find((x) => x.key === "operatingMargin")?.threshold,
    ).toBe("> 8%");
    expect(r.breakdown.find((x) => x.key === "debtToEquity")?.threshold).toBe(
      "< 0.35x",
    );
    expect(r.breakdown.find((x) => x.key === "marketCap")?.threshold).toBe(
      "$300M–$4B",
    );
  });
});
