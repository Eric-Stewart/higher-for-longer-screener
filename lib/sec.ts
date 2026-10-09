import type { Metric } from "./types";

export type SecFact = {
  val: number;
  start?: string;
  end: string;
  filed: string;
  form: string;
  fy?: number;
  fp?: string;
  accn?: string;
  frame?: string;
};

type FactNode = { units?: Record<string, SecFact[]> };
export type CompanyFacts = { facts?: Record<string, Record<string, FactNode>> };
export type ExtractedSecMetrics = {
  netIncome: Metric;
  revenue: Metric;
  operatingIncome: Metric;
  operatingMargin: Metric;
  debt: Metric;
  equity: Metric;
  debtToEquity: Metric;
  ebit: Metric;
  interestExpense: Metric;
  interestCoverage: Metric;
  operatingCashFlow: Metric;
  capex: Metric;
  freeCashFlow: Metric;
  freeCashFlowMargin: Metric;
  sharesOutstanding: Metric;
};

const FORMS = new Set([
  "10-K",
  "10-K/A",
  "10-Q",
  "10-Q/A",
  "20-F",
  "20-F/A",
  "40-F",
  "40-F/A",
]);
const days = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const valid = (f: SecFact, asOf: string) =>
  Number.isFinite(f.val) &&
  !!f.end &&
  !!f.filed &&
  f.filed <= asOf &&
  FORMS.has(f.form);
const latest = (rows: SecFact[]) =>
  [...rows].sort(
    (a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed),
  )[0];

export function selectTtmFact(
  rows: SecFact[],
  asOf: string,
): SecFact | undefined {
  const eligible = rows.filter((f) => valid(f, asOf) && f.start);
  const annual = eligible.filter((f) => {
    const d = days(f.start!, f.end);
    return d >= 300 && d <= 390;
  });
  const annualCandidate = annual.length ? latest(annual) : undefined;
  const quartersByEnd = new Map<string, SecFact>();
  for (const f of eligible.filter((f) => {
    const d = days(f.start!, f.end);
    return d >= 70 && d <= 110;
  })) {
    const existing = quartersByEnd.get(f.end);
    if (!existing || f.filed > existing.filed) quartersByEnd.set(f.end, f);
  }
  const quarters = [...quartersByEnd.values()]
    .sort((a, b) => b.end.localeCompare(a.end))
    .slice(0, 4);
  if (quarters.length !== 4) return annualCandidate;
  const chronological = [...quarters].sort((a, b) =>
    a.end.localeCompare(b.end),
  );
  const span = days(chronological[0].start!, chronological[3].end);
  if (span < 300 || span > 430) return annualCandidate;
  const newest = latest(quarters);
  const quarterCandidate = {
    ...newest,
    val: quarters.reduce((sum, f) => sum + f.val, 0),
    start: chronological[0].start,
    fp: "TTM",
    form: "derived from 4 reported quarters",
  };
  return !annualCandidate || quarterCandidate.end > annualCandidate.end
    ? quarterCandidate
    : annualCandidate;
}

function factSets(
  data: CompanyFacts,
  tags: string[],
  units: string[],
): SecFact[][] {
  const sets: SecFact[][] = [];
  for (const namespace of ["us-gaap", "dei"]) {
    for (const tag of tags) {
      const node = data.facts?.[namespace]?.[tag];
      if (!node?.units) continue;
      for (const unit of units)
        if (node.units[unit]?.length) sets.push(node.units[unit]);
    }
  }
  return sets;
}
function ttm(
  data: CompanyFacts,
  tags: string[],
  asOf: string,
  units = ["USD"],
): SecFact | undefined {
  for (const rows of factSets(data, tags, units)) {
    const selected = selectTtmFact(rows, asOf);
    if (selected) return selected;
  }
}
function instant(
  data: CompanyFacts,
  tags: string[],
  units: string[],
  asOf: string,
): SecFact | undefined {
  for (const rows of factSets(data, tags, units)) {
    const selected = latest(rows.filter((f) => valid(f, asOf) && !f.start));
    if (selected) return selected;
  }
}
function metric(
  f: SecFact | undefined,
  sourceUrl: string,
  reason: string,
): Metric {
  return f
    ? {
        value: f.val,
        sourceUrl,
        asOf: f.end,
        end: f.end,
        filed: f.filed,
        form: f.form,
      }
    : { value: null, sourceUrl, asOf: null, reason };
}
function derived(
  value: number | null,
  sourceUrl: string,
  parts: Metric[],
  reason: string,
): Metric {
  if (value === null || !Number.isFinite(value))
    return { value: null, sourceUrl, asOf: null, reason };
  const periods = parts.map((part) => part.asOf);
  if (periods.some((period) => !period) || new Set(periods).size !== 1) {
    return {
      value: null,
      sourceUrl,
      asOf: null,
      reason: `${reason}; components must use the same reporting period`,
    };
  }
  const asOf = periods[0];
  const filed = parts
    .map((x) => x.filed)
    .filter(Boolean)
    .sort()
    .at(-1);
  return {
    value,
    sourceUrl,
    asOf,
    end: asOf ?? undefined,
    filed,
    form: "derived from aligned reported facts",
  };
}

export function extractSecMetrics(
  data: CompanyFacts,
  sourceUrl: string,
  asOf = new Date().toISOString().slice(0, 10),
): ExtractedSecMetrics {
  const netIncome = metric(
    ttm(
      data,
      [
        "NetIncomeLoss",
        "ProfitLoss",
        "NetIncomeLossAvailableToCommonStockholdersBasic",
      ],
      asOf,
    ),
    sourceUrl,
    "No usable reported TTM net income fact",
  );
  const revenue = metric(
    ttm(
      data,
      [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
      ],
      asOf,
    ),
    sourceUrl,
    "No usable reported TTM revenue fact",
  );
  const operatingIncome = metric(
    ttm(data, ["OperatingIncomeLoss"], asOf),
    sourceUrl,
    "No usable reported TTM operating income fact",
  );
  const operatingMargin = derived(
    revenue.value && operatingIncome.value !== null
      ? operatingIncome.value / revenue.value
      : null,
    sourceUrl,
    [operatingIncome, revenue],
    "Operating margin requires non-zero TTM revenue and TTM operating income",
  );

  const debtCombined = instant(
    data,
    [
      "LongTermDebtAndFinanceLeaseObligationsCurrentAndNoncurrent",
      "LongTermDebtCurrentAndNoncurrent",
      "LongTermDebtAndCapitalLeaseObligationsCurrentAndNoncurrent",
    ],
    ["USD"],
    asOf,
  );
  const longDebt = instant(
    data,
    [
      "LongTermDebtNoncurrent",
      "LongTermDebtAndFinanceLeaseObligationsNoncurrent",
    ],
    ["USD"],
    asOf,
  );
  const currentDebt = instant(
    data,
    ["LongTermDebtCurrent", "ShortTermBorrowings", "DebtCurrent"],
    ["USD"],
    asOf,
  );
  const debt = debtCombined
    ? metric(debtCombined, sourceUrl, "")
    : derived(
        longDebt || currentDebt
          ? (longDebt?.val ?? 0) + (currentDebt?.val ?? 0)
          : null,
        sourceUrl,
        [metric(longDebt, sourceUrl, ""), metric(currentDebt, sourceUrl, "")],
        "No reported current/non-current debt facts",
      );
  const equity = metric(
    instant(
      data,
      [
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
      ],
      ["USD"],
      asOf,
    ),
    sourceUrl,
    "No usable reported stockholders' equity fact",
  );
  const debtToEquity = derived(
    debt.value !== null && equity.value && equity.value > 0
      ? debt.value / equity.value
      : null,
    sourceUrl,
    [debt, equity],
    "Debt/equity requires reported debt and positive reported equity",
  );

  const ebit = metric(
    ttm(
      data,
      [
        "OperatingIncomeLoss",
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
      ],
      asOf,
    ),
    sourceUrl,
    "No usable reported TTM EBIT proxy fact",
  );
  const interestExpense = metric(
    ttm(
      data,
      [
        "InterestExpenseNonOperating",
        "InterestExpenseDebt",
        "InterestAndDebtExpense",
      ],
      asOf,
    ),
    sourceUrl,
    "No usable reported TTM interest expense fact",
  );
  const interestCoverage = derived(
    ebit.value !== null &&
      interestExpense.value &&
      Math.abs(interestExpense.value) > 0
      ? ebit.value / Math.abs(interestExpense.value)
      : null,
    sourceUrl,
    [ebit, interestExpense],
    "Interest coverage requires reported TTM EBIT and non-zero interest expense",
  );

  const operatingCashFlow = metric(
    ttm(
      data,
      [
        "NetCashProvidedByUsedInOperatingActivities",
        "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
      ],
      asOf,
    ),
    sourceUrl,
    "No usable reported TTM operating cash flow fact",
  );
  const capex = metric(
    ttm(
      data,
      [
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "PaymentsForAdditionsToPropertyPlantAndEquipment",
        "PaymentsToAcquireProductiveAssets",
      ],
      asOf,
    ),
    sourceUrl,
    "No usable reported TTM capital expenditure fact",
  );
  const freeCashFlow = derived(
    operatingCashFlow.value !== null && capex.value !== null
      ? operatingCashFlow.value - Math.abs(capex.value)
      : null,
    sourceUrl,
    [operatingCashFlow, capex],
    "FCF requires reported TTM operating cash flow and capital expenditures",
  );
  const freeCashFlowMargin = derived(
    freeCashFlow.value !== null && revenue.value
      ? freeCashFlow.value / revenue.value
      : null,
    sourceUrl,
    [freeCashFlow, revenue],
    "FCF margin requires reported FCF and non-zero TTM revenue",
  );
  const sharesOutstanding = metric(
    instant(data, ["EntityCommonStockSharesOutstanding"], ["shares"], asOf),
    sourceUrl,
    "No usable reported shares outstanding fact",
  );
  return {
    netIncome,
    revenue,
    operatingIncome,
    operatingMargin,
    debt,
    equity,
    debtToEquity,
    ebit,
    interestExpense,
    interestCoverage,
    operatingCashFlow,
    capex,
    freeCashFlow,
    freeCashFlowMargin,
    sharesOutstanding,
  };
}
