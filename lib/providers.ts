import { normalizeTicker } from "./csv";
import { extractSecMetrics, type CompanyFacts } from "./sec";
import { parseStooqDaily } from "./stooq";
import { parseYahooChart } from "./yahoo";
import type { CompanyMetrics, Metric } from "./types";

const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const USER_AGENT =
  process.env.SEC_USER_AGENT?.trim() ||
  "HigherForLongerScreener/1.0 (contact: https://github.com/Eric-Stewart)";
const memory = new Map<string, { expires: number; value: Promise<unknown> }>();

async function cached<T>(
  key: string,
  ttl: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = load();
  memory.set(key, { expires: Date.now() + ttl, value });
  try {
    return await value;
  } catch (error) {
    if (memory.get(key)?.value === value) memory.delete(key);
    throw error;
  }
}

async function checkedFetch(
  url: string,
  init?: RequestInit & { next?: { revalidate: number } },
  timeoutMs = 20_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok)
      throw new Error(
        `${new URL(url).hostname} returned HTTP ${response.status}`,
      );
    return response;
  } finally {
    clearTimeout(timer);
  }
}

type TickerEntry = { cik_str: number; ticker: string; title: string };
export async function getSecTickerMap(): Promise<Map<string, TickerEntry>> {
  return cached("sec-tickers", 86_400_000, async () => {
    const response = await checkedFetch(SEC_TICKERS_URL, {
      headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate" },
      next: { revalidate: 86400 },
    });
    const raw = (await response.json()) as Record<string, TickerEntry>;
    return new Map(
      Object.values(raw).map((entry) => [normalizeTicker(entry.ticker), entry]),
    );
  });
}

export async function fetchSecForTicker(ticker: string) {
  const normalized = normalizeTicker(ticker);
  const entry = (await getSecTickerMap()).get(normalized);
  if (!entry)
    throw new Error(
      `Ticker ${normalized} was not found in SEC company_tickers.json`,
    );
  const cik = String(entry.cik_str).padStart(10, "0");
  const sourceUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  return cached(`sec:${cik}`, 3_600_000, async () => {
    const response = await checkedFetch(sourceUrl, {
      headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate" },
      next: { revalidate: 3600 },
    });
    const data = (await response.json()) as CompanyFacts;
    return {
      ticker: normalized,
      name: entry.title,
      cik,
      sourceUrl,
      metrics: extractSecMetrics(data, sourceUrl),
    };
  });
}

export async function fetchStooqForTicker(ticker: string) {
  const normalized = normalizeTicker(ticker);
  const sourceUrl = `https://stooq.com/q/d/l/?s=${encodeURIComponent(`${normalized.toLowerCase()}.us`)}&d1=20200101&d2=20991231&i=d`;
  return cached(`stooq:${normalized}`, 900_000, async () => {
    const response = await checkedFetch(
      sourceUrl,
      {
        headers: { "User-Agent": "HigherForLongerScreener/1.0" },
        next: { revalidate: 900 },
      },
      5_000,
    );
    return {
      ticker: normalized,
      sourceUrl,
      provider: "stooq" as const,
      ...parseStooqDaily(await response.text(), sourceUrl),
    };
  });
}

const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const YAHOO_UA = "Mozilla/5.0 (X11; Linux x86_64)";

export async function fetchYahooForTicker(ticker: string) {
  const normalized = normalizeTicker(ticker);
  // Dots are exchange suffixes Yahoo does not use (e.g. BRK.B -> BRK-B).
  const symbol = encodeURIComponent(normalized.replace(/\./g, "-"));
  return cached(`yahoo:${normalized}`, 900_000, async () => {
    const errors: string[] = [];
    for (const host of YAHOO_HOSTS) {
      const sourceUrl = `https://${host}/v8/finance/chart/${symbol}?interval=1d&range=3mo`;
      try {
        const response = await checkedFetch(
          sourceUrl,
          {
            headers: { "User-Agent": YAHOO_UA },
            next: { revalidate: 900 },
          },
          10_000,
        );
        const parsed = parseYahooChart(await response.json(), sourceUrl);
        if (
          parsed.latestClose.value === null &&
          parsed.avgDollarVolume.value === null
        ) {
          throw new Error(
            parsed.latestClose.reason ?? "No usable Yahoo price rows",
          );
        }
        return {
          ticker: normalized,
          sourceUrl,
          provider: "yahoo" as const,
          ...parsed,
        };
      } catch (error) {
        errors.push(`${host}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw new Error(`Yahoo chart API failed (${errors.join("; ")})`);
  });
}

export async function fetchPriceForTicker(ticker: string) {
  const normalized = normalizeTicker(ticker);
  try {
    return await fetchYahooForTicker(normalized);
  } catch (yahooError) {
    try {
      return await fetchStooqForTicker(normalized);
    } catch (stooqError) {
      throw new Error(
        `Price unavailable (Yahoo: ${yahooError instanceof Error ? yahooError.message : String(yahooError)}; Stooq: ${stooqError instanceof Error ? stooqError.message : String(stooqError)})`,
      );
    }
  }
}

const unavailable = (sourceUrl: string, reason: string): Metric => ({
  value: null,
  sourceUrl,
  asOf: null,
  reason,
});

export async function screenTicker(
  ticker: string,
  name?: string,
): Promise<CompanyMetrics> {
  const normalized = normalizeTicker(ticker);
  const [secResult, priceResult] = await Promise.allSettled([
    fetchSecForTicker(normalized),
    fetchPriceForTicker(normalized),
  ]);
  if (secResult.status === "rejected" && priceResult.status === "rejected") {
    throw new Error(
      `SEC: ${String(secResult.reason)}; Price: ${String(priceResult.reason)}`,
    );
  }
  const sec = secResult.status === "fulfilled" ? secResult.value : null;
  const price = priceResult.status === "fulfilled" ? priceResult.value : null;
  const secUrl = sec?.sourceUrl ?? SEC_TICKERS_URL;
  const priceUrl = price?.sourceUrl ?? "https://query1.finance.yahoo.com";
  const priceLabel =
    price?.provider === "yahoo" ? "Yahoo close" : "Stooq close";
  const secMissing = (key: string) =>
    unavailable(
      secUrl,
      secResult.status === "rejected"
        ? `SEC unavailable: ${String(secResult.reason)}`
        : `SEC ${key} unavailable`,
    );
  const latestClose =
    price?.latestClose ??
    unavailable(
      priceUrl,
      priceResult.status === "rejected"
        ? `Price unavailable: ${String(priceResult.reason)}`
        : "Price unavailable",
    );
  const shares = sec?.metrics.sharesOutstanding;
  const marketCap: Metric =
    shares?.value != null && latestClose.value != null
      ? {
          value: shares.value * latestClose.value,
          sourceUrl: secUrl,
          sources: [
            { label: "SEC shares", url: secUrl, asOf: shares.asOf },
            { label: priceLabel, url: priceUrl, asOf: latestClose.asOf },
          ],
          asOf:
            [shares.asOf, latestClose.asOf]
              .filter((value): value is string => Boolean(value))
              .sort()
              .at(0) ?? null,
          form: "derived: reported shares × latest close",
        }
      : {
          ...unavailable(
            secUrl,
            `Market cap requires ${shares?.value == null ? "reported shares outstanding" : "a latest price close"}`,
          ),
          sources: [
            { label: "SEC shares", url: secUrl, asOf: shares?.asOf ?? null },
            { label: priceLabel, url: priceUrl, asOf: latestClose.asOf },
          ],
        };
  return {
    ticker: normalized,
    name: name || sec?.name || normalized,
    synthetic: false,
    netIncome: sec?.metrics.netIncome ?? secMissing("net income"),
    operatingMargin:
      sec?.metrics.operatingMargin ?? secMissing("operating margin"),
    debtToEquity: sec?.metrics.debtToEquity ?? secMissing("debt/equity"),
    interestCoverage:
      sec?.metrics.interestCoverage ?? secMissing("interest coverage"),
    freeCashFlow: sec?.metrics.freeCashFlow ?? secMissing("free cash flow"),
    freeCashFlowMargin:
      sec?.metrics.freeCashFlowMargin ?? secMissing("FCF margin"),
    marketCap,
    avgDollarVolume:
      price?.avgDollarVolume ??
      unavailable(
        priceUrl,
        priceResult.status === "rejected"
          ? `Price unavailable: ${String(priceResult.reason)}`
          : "20-session liquidity unavailable",
      ),
    latestClose,
  };
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = {
          status: "fulfilled",
          value: await worker(items[index]),
        };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}
