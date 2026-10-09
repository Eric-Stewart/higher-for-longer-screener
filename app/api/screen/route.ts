import { NextResponse } from "next/server";
import { mapLimit, screenTicker } from "@/lib/providers";
import { guardExpensiveRequest } from "@/lib/request-guard";
import { parseScreenRequest } from "@/lib/screen-request";
import { scoreCompany } from "@/lib/scoring";

export const maxDuration = 60;

export async function POST(request: Request) {
  const guard = guardExpensiveRequest(request, "screen", 4);
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
    const { tickers, thresholds } = parseScreenRequest(await request.json());
    const settled = await mapLimit(tickers, 10, (ticker) =>
      screenTicker(ticker),
    );
    const companies = settled.flatMap((result) =>
      result.status === "fulfilled"
        ? [scoreCompany(result.value, thresholds)]
        : [],
    );
    const errors = settled.flatMap((result, index) =>
      result.status === "rejected"
        ? [{ ticker: tickers[index], error: String(result.reason) }]
        : [],
    );
    return NextResponse.json({
      requested: tickers.length,
      successCount: companies.length,
      errorCount: errors.length,
      companies,
      errors,
      thresholds,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Screen request failed",
      },
      { status: 400 },
    );
  }
}
