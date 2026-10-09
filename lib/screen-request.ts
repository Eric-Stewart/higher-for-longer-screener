import { normalizeTicker } from "./csv";
import { DEFAULT_THRESHOLDS } from "./scoring";
import type { Thresholds } from "./types";

export const MAX_SCREEN_TICKERS = 20;

export function parseTickerIdentifier(ticker: unknown): string {
  if (typeof ticker !== "string")
    throw new Error("Ticker identifiers must be strings");
  const trimmed = ticker.trim();
  if (!/^[A-Za-z0-9.-]{1,12}$/.test(trimmed))
    throw new Error("Ticker identifiers contain unsupported characters");
  const normalized = normalizeTicker(trimmed);
  if (!normalized) throw new Error("Ticker identifier is empty");
  return normalized;
}

const ranges: Record<keyof Thresholds, [number, number]> = {
  netIncomeMin: [-1_000_000_000_000_000, 1_000_000_000_000_000],
  operatingMarginMin: [-10, 10],
  debtToEquityMax: [0, 1_000],
  interestCoverageMin: [0, 1_000],
  freeCashFlowMin: [-1_000_000_000_000_000, 1_000_000_000_000_000],
  freeCashFlowMarginMin: [-10, 10],
  marketCapMin: [0, 100_000_000_000_000],
  marketCapMax: [0, 100_000_000_000_000],
  avgDollarVolumeMin: [0, 100_000_000_000_000],
};

export function parseScreenRequest(body: unknown): {
  tickers: string[];
  thresholds: Thresholds;
} {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("Request body must be an object");
  const candidate = body as Record<string, unknown>;
  if (!Array.isArray(candidate.tickers))
    throw new Error("tickers must be an array");
  if (
    candidate.tickers.length < 1 ||
    candidate.tickers.length > MAX_SCREEN_TICKERS
  ) {
    throw new Error(
      `Provide 1–${MAX_SCREEN_TICKERS} tickers; larger requests must be split into batches`,
    );
  }
  if (candidate.tickers.some((ticker) => typeof ticker !== "string"))
    throw new Error("Ticker identifiers must be strings");
  const rawTickers = candidate.tickers as string[];
  const tickers = [...new Set(rawTickers.map(parseTickerIdentifier))];
  if (!tickers.length)
    throw new Error(`Provide 1–${MAX_SCREEN_TICKERS} valid tickers`);

  const supplied = candidate.thresholds ?? {};
  if (!supplied || typeof supplied !== "object" || Array.isArray(supplied))
    throw new Error("thresholds must be an object");
  const allowed = new Set(Object.keys(DEFAULT_THRESHOLDS));
  for (const key of Object.keys(supplied as object))
    if (!allowed.has(key)) throw new Error(`Unknown threshold: ${key}`);

  const thresholds = { ...DEFAULT_THRESHOLDS };
  for (const key of Object.keys(DEFAULT_THRESHOLDS) as (keyof Thresholds)[]) {
    if (!(key in supplied)) continue;
    const value = (supplied as Record<string, unknown>)[key];
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new Error(`${key} must be a finite number`);
    const [min, max] = ranges[key];
    if (value < min || value > max)
      throw new Error(`${key} is outside the allowed range ${min}–${max}`);
    thresholds[key] = value;
  }
  if (thresholds.marketCapMin > thresholds.marketCapMax)
    throw new Error("marketCapMin must be less than or equal to marketCapMax");
  return { tickers, thresholds };
}
