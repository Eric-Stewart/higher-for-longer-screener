import { describe, expect, it } from "vitest";
import { extractSecMetrics, selectTtmFact } from "./sec";

const fact = (
  val: number,
  start: string,
  end: string,
  filed: string,
  form = "10-Q",
  fy = 2026,
  fp = "Q3",
) => ({ val, start, end, filed, form, fy, fp, accn: "000-test" });

describe("SEC fact extraction", () => {
  it("selects the newest reported duration fact covering roughly one year", () => {
    const rows = [
      fact(7, "2026-01-01", "2026-09-30", "2026-11-01"),
      fact(10, "2025-10-01", "2026-09-30", "2026-11-01", "10-K", 2026, "FY"),
    ];
    expect(selectTtmFact(rows, "2026-12-01")?.val).toBe(10);
  });

  it("prefers a newer four-quarter TTM window over a stale annual fact", () => {
    const rows = [
      fact(40, "2024-01-01", "2024-12-31", "2025-02-01", "10-K", 2024, "FY"),
      fact(11, "2025-10-01", "2025-12-31", "2026-02-01", "10-Q", 2025, "Q4"),
      fact(12, "2026-01-01", "2026-03-31", "2026-05-01", "10-Q", 2026, "Q1"),
      fact(13, "2026-04-01", "2026-06-30", "2026-08-01", "10-Q", 2026, "Q2"),
      fact(14, "2026-07-01", "2026-09-30", "2026-11-01", "10-Q", 2026, "Q3"),
    ];
    expect(selectTtmFact(rows, "2026-12-01")?.val).toBe(50);
  });

  it("builds TTM from four discrete quarters when no annual fact exists", () => {
    const usd = (rows: ReturnType<typeof fact>[]) => ({ units: { USD: rows } });
    const facts = {
      facts: {
        dei: {
          EntityCommonStockSharesOutstanding: {
            units: {
              shares: [
                {
                  val: 10_000_000,
                  end: "2026-09-30",
                  filed: "2026-11-01",
                  form: "10-Q",
                  accn: "s",
                },
              ],
            },
          },
        },
        "us-gaap": {
          Revenues: usd([
            fact(
              20,
              "2026-01-01",
              "2026-03-31",
              "2026-05-01",
              "10-Q",
              2026,
              "Q1",
            ),
            fact(
              25,
              "2026-04-01",
              "2026-06-30",
              "2026-08-01",
              "10-Q",
              2026,
              "Q2",
            ),
            fact(
              30,
              "2026-07-01",
              "2026-09-30",
              "2026-11-01",
              "10-Q",
              2026,
              "Q3",
            ),
            fact(
              35,
              "2025-10-01",
              "2025-12-31",
              "2026-02-01",
              "10-Q",
              2025,
              "Q4",
            ),
          ]),
          NetIncomeLoss: usd([
            fact(
              2,
              "2026-01-01",
              "2026-03-31",
              "2026-05-01",
              "10-Q",
              2026,
              "Q1",
            ),
            fact(
              3,
              "2026-04-01",
              "2026-06-30",
              "2026-08-01",
              "10-Q",
              2026,
              "Q2",
            ),
            fact(
              4,
              "2026-07-01",
              "2026-09-30",
              "2026-11-01",
              "10-Q",
              2026,
              "Q3",
            ),
            fact(
              1,
              "2025-10-01",
              "2025-12-31",
              "2026-02-01",
              "10-Q",
              2025,
              "Q4",
            ),
          ]),
        },
      },
    };
    const result = extractSecMetrics(
      facts as never,
      "https://data.sec.gov/api/xbrl/companyfacts/CIK.json",
      "2026-12-01",
    );
    expect(result.netIncome.value).toBe(10);
    expect(result.revenue.value).toBe(110);
    expect(result.sharesOutstanding.value).toBe(10_000_000);
  });

  it("falls back to a later tag when the preferred tag has no usable fact", () => {
    const usd = (rows: ReturnType<typeof fact>[]) => ({ units: { USD: rows } });
    const facts = {
      facts: {
        "us-gaap": {
          NetIncomeLoss: usd([
            fact(
              99,
              "2026-01-01",
              "2026-12-31",
              "2027-02-01",
              "10-K",
              2026,
              "FY",
            ),
          ]),
          ProfitLoss: usd([
            fact(
              12,
              "2025-01-01",
              "2025-12-31",
              "2026-02-01",
              "10-K",
              2025,
              "FY",
            ),
          ]),
        },
      },
    };
    const result = extractSecMetrics(facts as never, "url", "2026-12-01");
    expect(result.netIncome.value).toBe(12);
    expect(result.netIncome.asOf).toBe("2025-12-31");
  });

  it("marks derived metrics unavailable when component reporting periods differ", () => {
    const usd = (rows: ReturnType<typeof fact>[]) => ({ units: { USD: rows } });
    const facts = {
      facts: {
        "us-gaap": {
          Revenues: usd([
            fact(
              100,
              "2025-01-01",
              "2025-12-31",
              "2026-02-01",
              "10-K",
              2025,
              "FY",
            ),
          ]),
          OperatingIncomeLoss: usd([
            fact(
              50,
              "2026-01-01",
              "2026-12-31",
              "2027-02-01",
              "10-K",
              2026,
              "FY",
            ),
          ]),
        },
      },
    };
    const result = extractSecMetrics(facts as never, "url", "2027-03-01");
    expect(result.operatingMargin.value).toBeNull();
    expect(result.operatingMargin.reason).toContain("same reporting period");
  });

  it("returns explicit reasons instead of manufacturing absent facts", () => {
    const result = extractSecMetrics(
      { facts: {} } as never,
      "url",
      "2026-12-01",
    );
    expect(result.operatingMargin.value).toBeNull();
    expect(result.operatingMargin.reason).toBeTruthy();
    expect(result.debtToEquity.value).toBeNull();
  });
});
