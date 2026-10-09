import type { Metric } from "./types";

const na = (sourceUrl: string, reason: string): Metric => ({
  value: null,
  sourceUrl,
  asOf: null,
  reason,
});

type YahooResult = {
  timestamp?: (number | null)[];
  indicators?: {
    quote?: {
      close?: (number | null)[];
      volume?: (number | null)[];
    }[];
    adjclose?: { adjclose?: (number | null)[] }[];
  };
};

type YahooChart = {
  chart?: {
    result?: YahooResult[] | null;
    error?: { description?: string } | null;
  };
};

export function parseYahooChart(
  payload: unknown,
  sourceUrl: string,
): { latestClose: Metric; avgDollarVolume: Metric; asOf: string | null } {
  const none = (reason: string) => ({
    latestClose: na(sourceUrl, reason),
    avgDollarVolume: na(sourceUrl, reason),
    asOf: null,
  });
  const chart = (payload as YahooChart | null)?.chart;
  const result = chart?.result?.[0];
  if (!chart || chart.error || !result) {
    const detail =
      chart?.error?.description || "No Yahoo chart result for this ticker";
    return none(`Yahoo error: ${detail}`);
  }
  const stamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  const closes = quote?.close ?? [];
  const volumes = quote?.volume ?? [];
  const adj = result.indicators?.adjclose?.[0]?.adjclose;
  const valid: { date: string; close: number; volume: number }[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const ts = stamps[i];
    const close = closes[i];
    const volume = volumes[i];
    if (
      typeof ts !== "number" ||
      !Number.isFinite(ts) ||
      typeof close !== "number" ||
      !Number.isFinite(close) ||
      close <= 0 ||
      typeof volume !== "number" ||
      !Number.isFinite(volume) ||
      volume < 0
    ) {
      continue;
    }
    // Mirror split/dividend-adjusted closes (Stooq semantics) when Yahoo
    // provides an adjclose series; fall back to raw closes otherwise.
    const rawAdj = adj?.[i];
    const ratio =
      typeof rawAdj === "number" && Number.isFinite(rawAdj) && close !== 0
        ? rawAdj / close
        : 1;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    valid.push({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      close: close * ratio,
      volume,
    });
  }
  valid.sort((a, b) => a.date.localeCompare(b.date));
  if (!valid.length) {
    return none("No valid Yahoo daily price rows");
  }
  const latest = valid[valid.length - 1];
  const window = valid.slice(-20);
  const meta = { sourceUrl, asOf: latest.date, end: latest.date };
  return {
    latestClose: { value: latest.close, ...meta },
    avgDollarVolume:
      window.length < 20
        ? {
            value: null,
            ...meta,
            reason: `Only ${window.length} valid sessions; 20 required`,
          }
        : {
            value:
              window.reduce((n, x) => n + x.close * x.volume, 0) / 20,
            ...meta,
          },
    asOf: latest.date,
  };
}
