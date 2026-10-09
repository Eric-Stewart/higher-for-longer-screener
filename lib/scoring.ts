import type {
  BreakdownItem,
  CompanyMetrics,
  ScoredCompany,
  Thresholds,
} from "./types";
export const DEFAULT_THRESHOLDS: Thresholds = {
  netIncomeMin: 0,
  operatingMarginMin: 0.05,
  debtToEquityMax: 0.5,
  interestCoverageMin: 4,
  freeCashFlowMin: 0,
  freeCashFlowMarginMin: 0.03,
  marketCapMin: 200_000_000,
  marketCapMax: 5_000_000_000,
  avgDollarVolumeMin: 1_000_000,
};
const compactUsd = (value: number) =>
  `$${value >= 1_000_000_000 ? `${Number((value / 1_000_000_000).toFixed(2))}B` : `${Number((value / 1_000_000).toFixed(2))}M`}`;
const specs = [
  [
    "netIncome",
    "Net income",
    12,
    (v: number, t: Thresholds) => v > t.netIncomeMin,
    (t: Thresholds) => `> ${compactUsd(t.netIncomeMin)}`,
  ],
  [
    "operatingMargin",
    "Operating margin",
    14,
    (v: number, t: Thresholds) => v > t.operatingMarginMin,
    (t: Thresholds) => `> ${Number((t.operatingMarginMin * 100).toFixed(2))}%`,
  ],
  [
    "debtToEquity",
    "Debt / equity",
    12,
    (v: number, t: Thresholds) => v < t.debtToEquityMax,
    (t: Thresholds) => `< ${Number(t.debtToEquityMax.toFixed(2))}x`,
  ],
  [
    "interestCoverage",
    "Interest coverage",
    12,
    (v: number, t: Thresholds) => v > t.interestCoverageMin,
    (t: Thresholds) => `> ${Number(t.interestCoverageMin.toFixed(2))}x`,
  ],
  [
    "freeCashFlow",
    "Free cash flow",
    14,
    (v: number, t: Thresholds) => v > t.freeCashFlowMin,
    (t: Thresholds) => `> ${compactUsd(t.freeCashFlowMin)}`,
  ],
  [
    "freeCashFlowMargin",
    "FCF margin",
    12,
    (v: number, t: Thresholds) => v > t.freeCashFlowMarginMin,
    (t: Thresholds) =>
      `> ${Number((t.freeCashFlowMarginMin * 100).toFixed(2))}%`,
  ],
  [
    "marketCap",
    "Market cap",
    12,
    (v: number, t: Thresholds) => v >= t.marketCapMin && v <= t.marketCapMax,
    (t: Thresholds) =>
      `${compactUsd(t.marketCapMin)}–${compactUsd(t.marketCapMax)}`,
  ],
  [
    "avgDollarVolume",
    "20d avg $ volume",
    12,
    (v: number, t: Thresholds) => v > t.avgDollarVolumeMin,
    (t: Thresholds) => `> ${compactUsd(t.avgDollarVolumeMin)}`,
  ],
] as const;
export function scoreCompany(
  company: CompanyMetrics,
  thresholds: Thresholds,
): ScoredCompany {
  const breakdown: BreakdownItem[] = specs.map(
    ([key, label, weight, test, threshold]) => {
      const m = company[key];
      const missing = m.value === null || !Number.isFinite(m.value);
      const passed = missing ? null : test(m.value as number, thresholds);
      return {
        key,
        label,
        weight,
        value: missing ? null : m.value,
        passed,
        points: passed ? weight : 0,
        threshold: threshold(thresholds),
        reason: missing ? m.reason || "Metric unavailable" : undefined,
      } as BreakdownItem;
    },
  );
  const score = breakdown.reduce((n, x) => n + x.points, 0);
  const missingCount = breakdown.filter((x) => x.passed === null).length;
  const availableWeight = breakdown
    .filter((x) => x.passed !== null)
    .reduce((n, x) => n + x.weight, 0);
  return {
    ...company,
    score,
    missingCount,
    availableWeight,
    passedAll: missingCount === 0 && breakdown.every((x) => x.passed === true),
    breakdown,
  };
}
