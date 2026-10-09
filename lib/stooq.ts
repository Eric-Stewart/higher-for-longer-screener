import { parseCsv } from "./csv";
import type { Metric } from "./types";
const na = (sourceUrl: string, reason: string): Metric => ({
  value: null,
  sourceUrl,
  asOf: null,
  reason,
});
export function parseStooqDaily(
  csv: string,
  sourceUrl: string,
): { latestClose: Metric; avgDollarVolume: Metric; asOf: string | null } {
  if (/<!doctype html|verify your browser/i.test(csv)) {
    const reason =
      "Stooq returned a browser verification challenge instead of CSV";
    return {
      latestClose: na(sourceUrl, reason),
      avgDollarVolume: na(sourceUrl, reason),
      asOf: null,
    };
  }
  const rows = parseCsv(csv);
  if (rows.length < 2)
    return {
      latestClose: na(sourceUrl, "No valid Stooq daily price rows"),
      avgDollarVolume: na(sourceUrl, "No valid Stooq daily price rows"),
      asOf: null,
    };
  const h = rows[0].map((x) => x.toLowerCase()),
    di = h.indexOf("date"),
    ci = h.indexOf("close"),
    vi = h.indexOf("volume");
  const valid = rows
    .slice(1)
    .map((r) => ({ date: r[di], close: Number(r[ci]), volume: Number(r[vi]) }))
    .filter(
      (x) =>
        /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
        Number.isFinite(x.close) &&
        x.close > 0 &&
        Number.isFinite(x.volume) &&
        x.volume >= 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!valid.length)
    return {
      latestClose: na(sourceUrl, "No valid Stooq daily price rows"),
      avgDollarVolume: na(sourceUrl, "No valid Stooq daily price rows"),
      asOf: null,
    };
  const latest = valid[valid.length - 1],
    window = valid.slice(-20),
    meta = { sourceUrl, asOf: latest.date, end: latest.date };
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
            value: window.reduce((n, x) => n + x.close * x.volume, 0) / 20,
            ...meta,
          },
    asOf: latest.date,
  };
}
