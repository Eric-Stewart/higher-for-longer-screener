import type { Metric, ScoredCompany, ScoredMetricKey } from "./types";

const safe = (value: unknown) => {
  let text = value == null ? "" : String(value);
  const formulaLike = /^[=+@-]/.test(text);
  if (formulaLike) text = `'${text}`;
  return formulaLike || /[",\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
};

const factors: { key: ScoredMetricKey; label: string }[] = [
  { key: "netIncome", label: "Net income" },
  { key: "operatingMargin", label: "Operating margin" },
  { key: "debtToEquity", label: "Debt/equity" },
  { key: "interestCoverage", label: "Interest coverage" },
  { key: "freeCashFlow", label: "Free cash flow" },
  { key: "freeCashFlowMargin", label: "FCF margin" },
  { key: "marketCap", label: "Market cap" },
  { key: "avgDollarVolume", label: "20d avg dollar volume" },
];

function metricSources(metric: Metric | undefined): string {
  if (!metric) return "";
  if (metric.sources?.length) {
    return metric.sources
      .map(
        (source) => `${source.label} (${source.asOf ?? "N/A"}): ${source.url}`,
      )
      .join("; ");
  }
  return metric.sourceUrl;
}

export function resultsToCsv(rows: ScoredCompany[]): string {
  const header = ["Ticker", "Name", "Score", "Passed all", "Missing metrics"];
  for (const factor of factors) {
    header.push(
      factor.label,
      `${factor.label} threshold`,
      `${factor.label} weight`,
      `${factor.label} points`,
      `${factor.label} result`,
      `${factor.label} source(s)`,
      `${factor.label} as of`,
    );
  }
  header.push("Data mode");

  const body = rows.map((row) => {
    const values: unknown[] = [
      row.ticker,
      row.name,
      row.score,
      row.passedAll,
      row.missingCount,
    ];
    for (const factor of factors) {
      const metric = row[factor.key];
      const breakdown = row.breakdown.find((item) => item.key === factor.key);
      values.push(
        metric?.value == null
          ? `N/A: ${metric?.reason ?? breakdown?.reason ?? "Metric unavailable"}`
          : metric.value,
        breakdown?.threshold ?? "",
        breakdown?.weight ?? "",
        breakdown?.points ?? "",
        breakdown?.passed === null
          ? "N/A"
          : breakdown?.passed === true
            ? "PASS"
            : breakdown?.passed === false
              ? "FAIL"
              : "",
        metricSources(metric),
        metric?.asOf ?? "N/A",
      );
    }
    values.push(row.synthetic ? "Synthetic sample" : "Reported / market data");
    return values;
  });

  return [header, ...body].map((row) => row.map(safe).join(",")).join("\n");
}
