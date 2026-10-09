import { describe, expect, it } from "vitest";
import { parseStooqDaily } from "./stooq";
describe("Stooq", () => {
  it("reports an upstream browser verification challenge", () => {
    const r = parseStooqDaily(
      "<!DOCTYPE html><html><body>verify your browser</body></html>",
      "url",
    );
    expect(r.latestClose.reason).toContain("verification challenge");
  });
  it("uses the latest 20 valid ascending daily rows", () => {
    const rows = [
      "Date,Open,High,Low,Close,Volume",
      ...Array.from(
        { length: 22 },
        (_, i) =>
          `2026-09-${String(i + 1).padStart(2, "0")},1,2,1,${i + 1},${1000 + i}`,
      ),
    ].join("\n");
    const r = parseStooqDaily(rows, "url");
    expect(r.latestClose.value).toBe(22);
    const expected =
      Array.from({ length: 20 }, (_, i) => (i + 3) * (1002 + i)).reduce(
        (a, b) => a + b,
        0,
      ) / 20;
    expect(r.avgDollarVolume.value).toBeCloseTo(expected);
    expect(r.asOf).toBe("2026-09-22");
  });
  it("reports insufficient history", () => {
    const r = parseStooqDaily(
      "Date,Open,High,Low,Close,Volume\nN/D,N/D,N/D,N/D,N/D,N/D",
      "url",
    );
    expect(r.latestClose.value).toBeNull();
    expect(r.avgDollarVolume.reason).toContain("No valid");
  });
});
