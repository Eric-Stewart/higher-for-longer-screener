export type Metric = {
  value: number | null;
  sourceUrl: string;
  asOf: string | null;
  form?: string;
  filed?: string;
  end?: string;
  reason?: string;
  sources?: { label: string; url: string; asOf: string | null }[];
};

export type CompanyMetrics = {
  ticker: string;
  name: string;
  sector?: string;
  synthetic: boolean;
  netIncome: Metric;
  operatingMargin: Metric;
  debtToEquity: Metric;
  interestCoverage: Metric;
  freeCashFlow: Metric;
  freeCashFlowMargin: Metric;
  marketCap: Metric;
  avgDollarVolume: Metric;
  latestClose?: Metric;
};

export type Thresholds = {
  netIncomeMin: number;
  operatingMarginMin: number;
  debtToEquityMax: number;
  interestCoverageMin: number;
  freeCashFlowMin: number;
  freeCashFlowMarginMin: number;
  marketCapMin: number;
  marketCapMax: number;
  avgDollarVolumeMin: number;
};

export type ScoredMetricKey =
  | "netIncome"
  | "operatingMargin"
  | "debtToEquity"
  | "interestCoverage"
  | "freeCashFlow"
  | "freeCashFlowMargin"
  | "marketCap"
  | "avgDollarVolume";
export type BreakdownItem = {
  key: ScoredMetricKey;
  label: string;
  value: number | null;
  threshold: string;
  weight: number;
  points: number;
  passed: boolean | null;
  reason?: string;
};
export type ScoredCompany = CompanyMetrics & {
  score: number;
  passedAll: boolean;
  missingCount: number;
  availableWeight: number;
  breakdown: BreakdownItem[];
};
