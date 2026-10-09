import { NextResponse } from "next/server";
import { fetchSecForTicker } from "@/lib/providers";
import { guardExpensiveRequest } from "@/lib/request-guard";
import { parseTickerIdentifier } from "@/lib/screen-request";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const guard = guardExpensiveRequest(request, "sec", 30);
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
  let ticker: string;
  try {
    ticker = parseTickerIdentifier((await params).ticker);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid ticker" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await fetchSecForTicker(ticker));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "SEC request failed" },
      { status: 502 },
    );
  }
}
