# Higher-for-Longer Small-Cap Screener

An evidence-first Next.js dashboard for finding liquid, profitable, conservatively financed small caps. It runs offline with 28 clearly labeled synthetic companies and can screen supplied tickers using reported SEC Company Facts plus daily market prices (Yahoo Finance primary, Stooq fallback). It never asks an LLM to generate financial values.

> Research software, not investment advice. XBRL tagging varies by issuer; inspect linked source filings before making a decision.

## Local setup

Requirements: Node.js 24 and npm 11.

```bash
cp .env.example .env.local
# Optional: override SEC_USER_AGENT with your own app name and monitored contact.
npm ci
npm run dev
```

Open `http://localhost:3000`. Production check:

```bash
npm test
npm run lint
npm run build
npm start
```

## Data and provenance

- **Universe:** official iShares IWM holdings CSV, refreshed through `GET /api/universe` and cached for 24 hours. The response includes `count`, companies, source URL, and upstream last-modified value when supplied.
- **Fundamentals:** SEC `company_tickers.json` maps ticker to CIK; SEC Company Facts supplies reported XBRL facts. Set a descriptive `SEC_USER_AGENT`. Source: `https://data.sec.gov/api/xbrl/companyfacts/`.
- **Price/liquidity:** Yahoo Finance daily chart API first (`interval=1d&range=3mo`, split/dividend-adjusted closes when Yahoo provides an `adjclose` series), Stooq daily CSV on failure. The latest valid close and mean of `close × volume` across the latest 20 valid sessions are used. Sources: `https://query1.finance.yahoo.com/`, `https://query2.finance.yahoo.com/`, `https://stooq.com/`.
- **Market cap:** latest SEC-reported shares outstanding × latest price close. It remains N/A when either input is missing.
- **Sample mode:** 28 fictitious, realistic synthetic records in `data/sample.ts`; every metric says `SYNTHETIC — NOT REPORTED` and uses a `sample://` source.

All external fetches run on the server. Each displayed metric carries a source URL and as-of date; SEC-derived metrics also carry form/filed metadata. Missing data remains visible with a reason and receives zero points.

## Formula and defaults

The composite is a fixed 100-point sum; missing factors are **not renormalized**.

| Factor | Default pass rule | Weight |
|---|---:|---:|
| TTM net income | > $0 | 12 |
| TTM operating income / revenue | > 5% | 14 |
| reported debt / stockholders’ equity | < 0.5× | 12 |
| TTM EBIT proxy / absolute interest expense | > 4× | 12 |
| TTM operating cash flow − absolute capex | > $0 | 14 |
| TTM FCF / revenue | > 3% | 12 |
| market cap | $200M–$5B inclusive | 12 |
| 20-session average dollar volume | > $1M | 12 |

TTM selection prefers the newest reported duration fact spanning 300–390 days. If absent, it sums four distinct reported 70–110 day quarters spanning roughly one year. Tag fallbacks advance only when a preferred tag has no eligible reported fact. Derived SEC metrics require component facts from the same reporting-period end; mismatches are marked N/A rather than combined. The extractor does not interpolate, annualize partial periods, or invent Q4 values. Tag fallbacks are listed in `lib/sec.ts`.

## Universe refresh and manual fallback

1. Select **Refresh IWM universe**. The API returns the full parsed equity count; the browser stages only the first 20 to respect the bounded screen endpoint.
2. Edit the ticker list and select **Run real-data screen**.
3. If iShares is unavailable or its CSV layout changes, select **Upload CSV**. Accepted forms are `ticker,name`, `symbol,name`, or ticker-first rows. Dots normalize to SEC-style hyphens and duplicates are removed.

Direct endpoint example:

```bash
curl -X POST http://localhost:3000/api/screen   -H 'content-type: application/json'   -d '{"tickers":["ACLS","AMKR","CALM"]}'
```

The endpoint accepts 1–20 unique string tickers, rejects malformed or oversized requests, and processes at concurrency 10 so two worst-case 20-second waves remain within the 60-second serverless budget. Expensive routes reject cross-site browser calls and apply a best-effort per-instance client rate limit; production operators should also enable deployment-edge rate limiting for distributed enforcement. To exercise 24 real tickers against both providers in bounded batches:

```bash
npm run verify:real
```

The verifier prints attempted, successful, and error counts; it exits nonzero if no complete record succeeds and writes no transient data.

## Personal research fields

The detail drawer includes a qualitative checklist, notes, and a field for a pasted Gemini summary. These values are user-provided and stored only in browser `localStorage` under each ticker. They do not affect scoring and are not sent to the server.

## Deployment placeholders

- Repository: `https://github.com/Eric-Stewart/higher-for-longer-screener`
- Production: `https://higher-for-longer-screener.vercel.app`

No repository or deployment is created by this project bootstrap.
