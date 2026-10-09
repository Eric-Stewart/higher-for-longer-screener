import { NextResponse } from "next/server";
import { parseIwmHoldings } from "@/lib/csv";
import { guardExpensiveRequest } from "@/lib/request-guard";

export const runtime = "nodejs";
const IWM_URL =
  "https://www.ishares.com/us/products/239710/ishares-russell-2000-etf/latest-holdings.csv";

export async function GET(request: Request) {
  const guard = guardExpensiveRequest(request, "universe", 10);
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.error },
      {
        status: guard.status,
        headers: guard.retryAfter
          ? { "Retry-After": String(guard.retryAfter) }
          : undefined,
      },
    );
  }
  try {
    const response = await fetch(IWM_URL, {
      headers: { "User-Agent": "HigherForLongerScreener/1.0" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`iShares returned HTTP ${response.status}`);
    const companies = parseIwmHoldings(await response.text());
    return NextResponse.json({
      count: companies.length,
      companies,
      sourceUrl: IWM_URL,
      asOf: response.headers.get("last-modified"),
    });
  } catch (error) {
    return NextResponse.json(
      {
        count: 0,
        companies: [],
        sourceUrl: IWM_URL,
        error:
          error instanceof Error ? error.message : "Universe request failed",
      },
      { status: 502 },
    );
  }
}
