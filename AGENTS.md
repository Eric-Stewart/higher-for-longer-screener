# Agent Operating Guide

## Required commands
```bash
npm ci
npm test
npm run lint
npm run build
npm run verify:real
npm run dev
```

## Rules
- Write or update a failing Vitest test before changing scoring, CSV, SEC, Stooq, or export transforms.
- Keep external requests inside server routes or server-only provider modules. Never add paid APIs, API keys, a database, or generated financial values.
- Preserve `Metric` provenance (`sourceUrl`, `asOf`, `form`/`filed`, and explicit `reason` for `null`). Missing values receive zero points and are never removed or score-renormalized.
- Keep `/api/screen` bounded to 50 tickers and concurrency 3 or lower. SEC requests require `SEC_USER_AGENT` in real use.
- Update `DESIGN.md` before introducing design tokens or component-state conventions.
- Do not commit generated `.next`, coverage, logs, or real-verification output. Do not commit or push unless explicitly authorized.
