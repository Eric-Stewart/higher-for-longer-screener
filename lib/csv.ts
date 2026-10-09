export type UniverseCompany = { ticker: string; name: string; sector?: string };

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function normalizeTicker(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\./g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 12);
}

export function parseIwmHoldings(input: string): UniverseCompany[] {
  const rows = parseCsv(input);
  const headerIndex = rows.findIndex(
    (row) =>
      row.some((cell) => cell.trim().toLowerCase() === "ticker") &&
      row.some((cell) => cell.trim().toLowerCase() === "name"),
  );
  if (headerIndex < 0)
    throw new Error("IWM CSV did not contain a Ticker/Name header row");
  const headers = rows[headerIndex].map((cell) => cell.trim().toLowerCase());
  const tickerIndex = headers.indexOf("ticker");
  const nameIndex = headers.indexOf("name");
  const sectorIndex = headers.indexOf("sector");
  const assetIndex = headers.indexOf("asset class");
  const seen = new Set<string>();
  return rows.slice(headerIndex + 1).flatMap((row) => {
    const ticker = normalizeTicker(row[tickerIndex] ?? "");
    const assetClass = row[assetIndex]?.toLowerCase() ?? "equity";
    if (
      !ticker ||
      ticker === "-" ||
      !assetClass.includes("equity") ||
      seen.has(ticker)
    )
      return [];
    seen.add(ticker);
    return [
      {
        ticker,
        name: row[nameIndex]?.trim() || ticker,
        sector:
          sectorIndex >= 0 ? row[sectorIndex]?.trim() || undefined : undefined,
      },
    ];
  });
}

export function parseTickerUpload(input: string): UniverseCompany[] {
  const rows = parseCsv(input);
  if (!rows.length) return [];
  const lower = rows[0].map((cell) => cell.toLowerCase());
  const hasHeader = lower.includes("ticker") || lower.includes("symbol");
  const tickerIndex = hasHeader
    ? Math.max(lower.indexOf("ticker"), lower.indexOf("symbol"))
    : 0;
  const nameIndex = hasHeader ? lower.indexOf("name") : 1;
  const seen = new Set<string>();
  return rows.slice(hasHeader ? 1 : 0).flatMap((row) => {
    const ticker = normalizeTicker(row[tickerIndex] ?? "");
    if (!ticker || seen.has(ticker)) return [];
    seen.add(ticker);
    return [
      {
        ticker,
        name: nameIndex >= 0 ? row[nameIndex]?.trim() || ticker : ticker,
      },
    ];
  });
}
