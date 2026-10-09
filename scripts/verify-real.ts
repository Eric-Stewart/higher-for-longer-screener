import { mapLimit, screenTicker } from "../lib/providers";

const TICKERS = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "META",
  "NVDA",
  "INTC",
  "AMD",
  "CSCO",
  "ORCL",
  "IBM",
  "TXN",
  "QCOM",
  "ADBE",
  "CRM",
  "AMAT",
  "LRCX",
  "MU",
  "KLAC",
  "ADI",
  "MCHP",
  "NXPI",
  "FSLR",
  "ENPH",
];

async function main() {
  const settled = await mapLimit(TICKERS, 2, (ticker) => screenTicker(ticker));
  let successCount = 0;
  const reasons = new Map<string, number>();
  settled.forEach((result) => {
    if (result.status === "rejected") {
      const reason = String(result.reason);
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      return;
    }
    const record = result.value;
    const hasSec = [
      record.netIncome,
      record.operatingMargin,
      record.freeCashFlow,
    ].some((metric) => metric.value !== null);
    const hasPrice =
      record.latestClose?.value != null && record.avgDollarVolume.value != null;
    if (hasSec && hasPrice) successCount++;
    else {
      const reason = !hasSec
        ? record.netIncome.reason || "No usable SEC fundamentals"
        : record.avgDollarVolume.reason ||
          record.latestClose?.reason ||
          "No complete Stooq price record";
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
  });
  const errorCount = TICKERS.length - successCount;
  const error = [...reasons.entries()]
    .map(([reason, count]) => `${count}× ${reason}`)
    .join("; ");
  console.log(
    JSON.stringify({
      attempted: TICKERS.length,
      successCount,
      errorCount,
      error,
    }),
  );
  if (successCount === 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      attempted: TICKERS.length,
      successCount: 0,
      errorCount: TICKERS.length,
      error: String(error),
    }),
  );
  process.exitCode = 1;
});
