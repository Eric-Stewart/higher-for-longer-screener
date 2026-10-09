"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { SAMPLE_COMPANIES } from "@/data/sample";
import { DEFAULT_THRESHOLDS, scoreCompany } from "@/lib/scoring";
import { parseTickerUpload, type UniverseCompany } from "@/lib/csv";
import { resultsToCsv } from "@/lib/export";
import type { Metric, ScoredCompany, Thresholds } from "@/lib/types";

type SortKey =
  | "ticker"
  | "name"
  | "score"
  | "operatingMargin"
  | "debtToEquity"
  | "freeCashFlow"
  | "marketCap";
type Notes = { checks: Record<string, boolean>; notes: string; gemini: string };
const checklist = [
  "Durable moat",
  "Pricing power",
  "Customer concentration reviewed",
  "Debt maturity ladder reviewed",
  "Insider ownership reviewed",
];
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const metricValue = (row: ScoredCompany, key: SortKey) =>
  key === "ticker" || key === "name" || key === "score"
    ? row[key]
    : (row[key].value ?? -Infinity);
const fmt = (m: Metric, kind: "money" | "pct" | "ratio" = "ratio") =>
  m.value === null
    ? "N/A"
    : kind === "money"
      ? money.format(m.value)
      : kind === "pct"
        ? `${(m.value * 100).toFixed(1)}%`
        : `${number.format(m.value)}×`;
const thresholdFields: [keyof Thresholds, string, string, number][] = [
  ["netIncomeMin", "Net income >", "$M", 1_000_000],
  ["operatingMarginMin", "Op. margin >", "%", 0.01],
  ["debtToEquityMax", "D/E <", "×", 0.1],
  ["interestCoverageMin", "Coverage >", "×", 1],
  ["freeCashFlowMin", "FCF >", "$M", 1_000_000],
  ["freeCashFlowMarginMin", "FCF margin >", "%", 0.01],
  ["marketCapMin", "Market cap min", "$M", 50_000_000],
  ["marketCapMax", "Market cap max", "$B", 500_000_000],
  ["avgDollarVolumeMin", "Avg $ volume >", "$M", 250_000],
];
function displayThreshold(key: keyof Thresholds, value: number) {
  if (key.includes("Margin")) return value * 100;
  if (key === "marketCapMax") return value / 1e9;
  if (
    key.includes("Income") ||
    key.includes("Flow") ||
    key.includes("marketCap") ||
    key.includes("Volume")
  )
    return value / 1e6;
  return value;
}
function parseThreshold(key: keyof Thresholds, value: number) {
  if (key.includes("Margin")) return value / 100;
  if (key === "marketCapMax") return value * 1e9;
  if (
    key.includes("Income") ||
    key.includes("Flow") ||
    key.includes("marketCap") ||
    key.includes("Volume")
  )
    return value * 1e6;
  return value;
}

export function Dashboard() {
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [raw, setRaw] = useState(SAMPLE_COMPANIES);
  const [mode, setMode] = useState<"sample" | "live">("sample");
  const [showPassed, setShowPassed] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "score",
    dir: -1,
  });
  const [selected, setSelected] = useState<ScoredCompany | null>(null);
  const [tickerText, setTickerText] = useState("ACLS, AMKR, CALM, CRUS, EXPO");
  const [status, setStatus] = useState(
    "28 synthetic companies loaded — no network required.",
  );
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scored = useMemo(
    () => raw.map((c) => scoreCompany(c, thresholds)),
    [raw, thresholds],
  );
  const scoringGuide = useMemo(
    () => scoreCompany(SAMPLE_COMPANIES[0], thresholds).breakdown,
    [thresholds],
  );
  const shown = useMemo(
    () =>
      scored
        .filter((r) => !showPassed || r.passedAll)
        .sort((a, b) => {
          const av = metricValue(a, sort.key),
            bv = metricValue(b, sort.key);
          return (
            (typeof av === "string"
              ? av.localeCompare(String(bv))
              : Number(av) - Number(bv)) * sort.dir
          );
        }),
    [scored, showPassed, sort],
  );
  const passCount = scored.filter((x) => x.passedAll).length;
  const missingCount = scored.filter((x) => x.missingCount > 0).length;
  function changeSort(key: SortKey) {
    setSort((s) => ({
      key,
      dir:
        s.key === key
          ? s.dir === 1
            ? -1
            : 1
          : key === "ticker" || key === "name"
            ? 1
            : -1,
    }));
  }
  async function runLive(companies?: UniverseCompany[]) {
    const tickers = (
      companies?.map((x) => x.ticker) ?? tickerText.split(/[\s,;]+/)
    ).filter(Boolean);
    if (tickers.length > 20) {
      setStatus(
        "Live screen accepts at most 20 tickers per request; split larger lists into batches.",
      );
      return;
    }
    if (!tickers.length) {
      setStatus("Enter at least one ticker.");
      return;
    }
    setLoading(true);
    setStatus(
      `Requesting ${tickers.length} tickers from SEC and price providers…`,
    );
    try {
      const response = await fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers, thresholds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Screen failed");
      setRaw(data.companies);
      setMode("live");
      setStatus(
        `${data.successCount}/${data.requested} records returned; ${data.errorCount} request errors. Missing metrics remain visible.`,
      );
    } catch (error) {
      setStatus(
        `Live screen failed: ${error instanceof Error ? error.message : "Unknown error"}. Sample mode remains available.`,
      );
    } finally {
      setLoading(false);
    }
  }
  async function loadUniverse() {
    setLoading(true);
    setStatus("Refreshing official IWM holdings…");
    try {
      const response = await fetch("/api/universe");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Universe unavailable");
      const first = data.companies.slice(0, 20) as UniverseCompany[];
      setTickerText(first.map((x) => x.ticker).join(", "));
      setStatus(
        `${data.count} equity holdings returned by iShares. First 20 staged (per-request safety limit); edit the list, then run.`,
      );
    } catch (error) {
      setStatus(
        `IWM refresh failed: ${error instanceof Error ? error.message : "Unknown error"}. Upload a CSV or use sample mode.`,
      );
    } finally {
      setLoading(false);
    }
  }
  async function upload(file: File) {
    try {
      const companies = parseTickerUpload(await file.text());
      if (!companies.length) throw new Error("No valid tickers found");
      const bounded = companies.slice(0, 20);
      setTickerText(bounded.map((x) => x.ticker).join(", "));
      setStatus(
        `${companies.length} unique tickers parsed; ${bounded.length} staged under the 20-ticker request limit.`,
      );
    } catch (error) {
      setStatus(
        `Upload failed: ${error instanceof Error ? error.message : "Invalid CSV"}`,
      );
    }
  }
  function exportCsv() {
    const blob = new Blob([resultsToCsv(shown)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `higher-for-longer-${showPassed ? "passed" : "scored"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main>
      <header className="topbar">
        <div>
          <div className="brand">
            <span className="mark">H/L</span>
            <span>HIGHER FOR LONGER</span>
          </div>
          <p>Small-cap quality &amp; liquidity screen</p>
        </div>
        <div className="header-meta">
          <span className={`badge ${mode}`}>
            {mode === "sample" ? "SYNTHETIC SAMPLE" : "LIVE SOURCES"}
          </span>
          <span>8-factor / 100 points</span>
        </div>
      </header>
      <section className="workspace">
        <div className="title-row">
          <div>
            <h1>Resilience board</h1>
            <p>
              Reported fundamentals, market liquidity, and every missing value
              in view.
            </p>
          </div>
          <div className="actions">
            <button
              className="secondary"
              onClick={() => {
                setRaw(SAMPLE_COMPANIES);
                setMode("sample");
                setStatus(
                  "28 synthetic companies loaded — no network required.",
                );
              }}
            >
              Sample data
            </button>
            <button
              className="secondary"
              onClick={loadUniverse}
              disabled={loading}
            >
              Refresh IWM universe
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="secondary"
            >
              Upload CSV
            </button>
            <input
              ref={fileRef}
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </div>
        </div>
        <div className="status" role="status">
          <span className={loading ? "pulse" : "dot"} />
          {status}
        </div>
        <section className="control-panel" aria-label="Screen controls">
          <div className="ticker-entry">
            <label htmlFor="tickers">
              Ticker list <span>up to 20 per request</span>
            </label>
            <textarea
              id="tickers"
              value={tickerText}
              onChange={(e) => setTickerText(e.target.value)}
              rows={2}
            />
            <button
              className="primary"
              onClick={() => runLive()}
              disabled={loading}
            >
              {loading ? "Working…" : "Run real-data screen"}
            </button>
          </div>
          <div className="thresholds">
            {thresholdFields.map(([key, label, unit, step]) => (
              <label key={key}>
                {label}
                <span className="number-input">
                  <input
                    type="number"
                    value={displayThreshold(key, thresholds[key])}
                    step={displayThreshold(key, step)}
                    onChange={(e) =>
                      setThresholds((t) => ({
                        ...t,
                        [key]: parseThreshold(key, Number(e.target.value)),
                      }))
                    }
                  />
                  <b>{unit}</b>
                </span>
              </label>
            ))}
          </div>
        </section>
        <section className="summary" aria-label="Screen summary">
          <div>
            <span>UNIVERSE</span>
            <strong>{scored.length}</strong>
            <small>
              {mode === "sample" ? "synthetic records" : "returned records"}
            </small>
          </div>
          <div>
            <span>PASSED ALL</span>
            <strong className="good-text">{passCount}</strong>
            <small>
              {scored.length
                ? Math.round((passCount / scored.length) * 100)
                : 0}
              % of scored
            </small>
          </div>
          <div>
            <span>WITH GAPS</span>
            <strong className="warn-text">{missingCount}</strong>
            <small>not silently excluded</small>
          </div>
          <div className="score-legend">
            <span>WEIGHT MAP</span>
            <div>
              <i style={{ width: "12%" }}>NI</i>
              <i style={{ width: "14%" }}>OM</i>
              <i style={{ width: "12%" }}>D/E</i>
              <i style={{ width: "12%" }}>IC</i>
              <i style={{ width: "14%" }}>FCF</i>
              <i style={{ width: "12%" }}>FM</i>
              <i style={{ width: "12%" }}>MC</i>
              <i style={{ width: "12%" }}>VOL</i>
            </div>
            <small>Missing factor = 0 points, never renormalized</small>
          </div>
        </section>
        <details className="scoring-how">
          <summary>How scoring works</summary>
          <p>
            The score is a fixed 100-point sum. A factor earns its full weight
            only when it passes the active rule; a failed or missing factor
            earns zero, and missing data is never renormalized.
          </p>
          <ul>
            {scoringGuide.map((item) => (
              <li key={item.key}>
                <b>{item.label}</b>
                <span>{item.threshold}</span>
                <strong>{item.weight} pts</strong>
              </li>
            ))}
          </ul>
        </details>
        <section className="results">
          <div className="results-head">
            <div>
              <h2>Ranked results</h2>
              <span>
                {shown.length} rows · sorted by {sort.key}
              </span>
            </div>
            <div className="segmented">
              <button
                className={!showPassed ? "active" : ""}
                onClick={() => setShowPassed(false)}
              >
                All scored
              </button>
              <button
                className={showPassed ? "active" : ""}
                onClick={() => setShowPassed(true)}
              >
                Passed all
              </button>
            </div>
            <button
              className="secondary"
              onClick={exportCsv}
              disabled={!shown.length}
            >
              Export CSV
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    ["ticker", "Ticker"],
                    ["name", "Company"],
                    ["score", "Score"],
                    ["operatingMargin", "Op margin"],
                    ["debtToEquity", "D / E"],
                    ["freeCashFlow", "FCF"],
                    ["marketCap", "Market cap"],
                  ].map(([key, label]) => (
                    <th
                      key={key}
                      aria-sort={
                        sort.key === key
                          ? sort.dir === 1
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button onClick={() => changeSort(key as SortKey)}>
                        {label}
                        <span>
                          {sort.key === key
                            ? sort.dir === 1
                              ? "↑"
                              : "↓"
                            : "↕"}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <ResultRow
                    key={row.ticker}
                    row={row}
                    open={() => setSelected(row)}
                  />
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={8} className="empty">
                      No companies match this view. Switch to “All scored” or
                      adjust thresholds.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="cards">
            {shown.map((row) => (
              <ResultCard
                key={row.ticker}
                row={row}
                open={() => setSelected(row)}
              />
            ))}
          </div>
        </section>
      </section>
      {selected && (
        <DetailDrawer company={selected} close={() => setSelected(null)} />
      )}
    </main>
  );
}
function ScoreRail({ row }: { row: ScoredCompany }) {
  return (
    <div
      className="rail"
      aria-label={`${row.breakdown.filter((x) => x.passed).length} of 8 factors passed`}
    >
      {row.breakdown.map((x) => (
        <span
          key={x.key}
          className={x.passed === null ? "missing" : x.passed ? "pass" : "fail"}
          title={`${x.label}: ${x.passed === null ? "missing" : x.passed ? "pass" : "fail"}`}
        />
      ))}
    </div>
  );
}
function ResultRow({ row, open }: { row: ScoredCompany; open: () => void }) {
  return (
    <tr
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
    >
      <td className="ticker">
        <button
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
          aria-label={`Open ${row.ticker} company details`}
        >
          {row.ticker}
        </button>
        <ScoreRail row={row} />
      </td>
      <td>
        <strong>{row.name}</strong>
        <small>{row.sector || "Sector not supplied"}</small>
      </td>
      <td>
        <b
          className={`score ${row.score >= 75 ? "high" : row.score >= 50 ? "mid" : "low"}`}
        >
          {row.score}
        </b>
        <small>{row.availableWeight}% available</small>
      </td>
      <td>{fmt(row.operatingMargin, "pct")}</td>
      <td>{fmt(row.debtToEquity)}</td>
      <td>{fmt(row.freeCashFlow, "money")}</td>
      <td>{fmt(row.marketCap, "money")}</td>
      <td>
        <button
          className="evidence"
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
        >
          {row.synthetic ? "SAMPLE" : "SOURCES"}
          {row.missingCount > 0 && <em>{row.missingCount} N/A</em>}
        </button>
        <small>
          {row.operatingMargin.asOf
            ? `AS OF ${row.operatingMargin.asOf}`
            : "AS OF N/A"}
        </small>
      </td>
    </tr>
  );
}
function ResultCard({ row, open }: { row: ScoredCompany; open: () => void }) {
  return (
    <article className="result-card">
      <div>
        <div>
          <b className="ticker-label">{row.ticker}</b>
          <h3>{row.name}</h3>
        </div>
        <b
          className={`score ${row.score >= 75 ? "high" : row.score >= 50 ? "mid" : "low"}`}
        >
          {row.score}
        </b>
      </div>
      <ScoreRail row={row} />
      <dl>
        <div>
          <dt>Op margin</dt>
          <dd>{fmt(row.operatingMargin, "pct")}</dd>
        </div>
        <div>
          <dt>D / E</dt>
          <dd>{fmt(row.debtToEquity)}</dd>
        </div>
        <div>
          <dt>FCF</dt>
          <dd>{fmt(row.freeCashFlow, "money")}</dd>
        </div>
        <div>
          <dt>Market cap</dt>
          <dd>{fmt(row.marketCap, "money")}</dd>
        </div>
      </dl>
      <button className="secondary full" onClick={open}>
        Inspect evidence · {row.missingCount} missing
      </button>
    </article>
  );
}
function DetailDrawer({
  company,
  close,
}: {
  company: ScoredCompany;
  close: () => void;
}) {
  const key = `hfl-notes:${company.ticker}`;
  const initial = () => {
    if (typeof window === "undefined")
      return { checks: {}, notes: "", gemini: "" };
    try {
      return JSON.parse(localStorage.getItem(key) || "") as Notes;
    } catch {
      return { checks: {}, notes: "", gemini: "" };
    }
  };
  const [notes, setNotes] = useState<Notes>(initial);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  function save(next: Notes) {
    setNotes(next);
    localStorage.setItem(key, JSON.stringify(next));
  }
  return (
    <div
      className="drawer-layer"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <header>
          <div>
            <span className="ticker-label">
              {company.ticker} ·{" "}
              {company.synthetic ? "SYNTHETIC" : "REPORTED + MARKET"}
            </span>
            <h2 id="drawer-title">{company.name}</h2>
            <p>
              Score {company.score}/100 · {company.missingCount} missing factors
            </p>
          </div>
          <button
            className="close"
            onClick={close}
            aria-label="Close details"
            autoFocus
          >
            ×
          </button>
        </header>
        <div className="drawer-body">
          <section>
            <h3>Metric evidence</h3>
            <div className="metric-list">
              {company.breakdown.map((item) => {
                const metric = company[
                  item.key as keyof ScoredCompany
                ] as Metric;
                return (
                  <div className="metric-row" key={item.key}>
                    <span
                      className={
                        item.passed === null
                          ? "state missing"
                          : item.passed
                            ? "state pass"
                            : "state fail"
                      }
                    >
                      {item.passed === null
                        ? "N/A"
                        : item.passed
                          ? "PASS"
                          : "FAIL"}
                    </span>
                    <div>
                      <b>{item.label}</b>
                      <small>
                        {item.threshold} · {item.weight} points
                      </small>
                      {item.reason && <em>{item.reason}</em>}
                      <span className="source">
                        {metric?.form || "Source metric"} · as of{" "}
                        {metric?.asOf || "unknown"} ·{" "}
                        {metric?.sources?.length ? (
                          metric.sources.map((source, index) => (
                            <span key={source.url}>
                              {index > 0 ? " · " : ""}
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {source.label}
                              </a>{" "}
                              ({source.asOf || "unknown"})
                            </span>
                          ))
                        ) : (
                          <a
                            href={metric?.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            source
                          </a>
                        )}
                      </span>
                    </div>
                    <strong>
                      {item.value === null
                        ? "N/A"
                        : item.key.includes("Margin")
                          ? `${(item.value * 100).toFixed(1)}%`
                          : item.key === "freeCashFlow" ||
                              item.key === "marketCap"
                            ? money.format(item.value)
                            : number.format(item.value)}
                    </strong>
                  </div>
                );
              })}
            </div>
          </section>
          <section>
            <h3>Qualitative diligence</h3>
            <p className="section-note">
              Your checklist—not part of the quantitative score.
            </p>
            <div className="checklist">
              {checklist.map((label) => (
                <label key={label}>
                  <input
                    type="checkbox"
                    checked={!!notes.checks[label]}
                    onChange={(e) =>
                      save({
                        ...notes,
                        checks: { ...notes.checks, [label]: e.target.checked },
                      })
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </section>
          <section>
            <label className="text-label">
              Research notes
              <textarea
                rows={5}
                value={notes.notes}
                onChange={(e) => save({ ...notes, notes: e.target.value })}
                placeholder="Catalysts, risks, filing questions…"
              />
            </label>
          </section>
          <section>
            <label className="text-label">
              Pasted Gemini summary{" "}
              <span>user-provided; not verified financial data</span>
              <textarea
                rows={7}
                value={notes.gemini}
                onChange={(e) => save({ ...notes, gemini: e.target.value })}
                placeholder="Paste an external summary here. It stays in this browser only."
              />
            </label>
          </section>
        </div>
        <footer>
          <span>Saved locally per ticker</span>
          <button className="primary" onClick={close}>
            Done
          </button>
        </footer>
      </aside>
    </div>
  );
}
