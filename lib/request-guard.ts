const WINDOW_MS = 60_000;
type Bucket = { startedAt: number; count: number };
const buckets = new Map<string, Bucket>();

type GuardResult =
  | { ok: true }
  | { ok: false; status: 403 | 429; error: string; retryAfter?: number };

function clientAddress(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function guardExpensiveRequest(
  request: Request,
  scope: string,
  limit: number,
): GuardResult {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    fetchSite === "cross-site" ||
    (origin && origin !== new URL(request.url).origin)
  ) {
    return {
      ok: false,
      status: 403,
      error: "Cross-site requests are not allowed",
    };
  }

  const now = Date.now();
  const key = `${scope}:${clientAddress(request)}`;
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.startedAt >= WINDOW_MS) {
    bucket = { startedAt: now, count: 0 };
    buckets.set(key, bucket);
  }
  if (bucket.count >= limit) {
    return {
      ok: false,
      status: 429,
      error: "Rate limit exceeded",
      retryAfter: Math.max(
        1,
        Math.ceil((WINDOW_MS - (now - bucket.startedAt)) / 1000),
      ),
    };
  }
  bucket.count += 1;
  return { ok: true };
}

export function resetRequestGuardsForTests(): void {
  buckets.clear();
}
