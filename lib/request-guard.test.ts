import { beforeEach, describe, expect, it } from "vitest";
import {
  guardExpensiveRequest,
  resetRequestGuardsForTests,
} from "./request-guard";

const request = (headers: Record<string, string> = {}) =>
  new Request("https://example.test/api/screen", { headers });

describe("expensive route guard", () => {
  beforeEach(resetRequestGuardsForTests);

  it("rejects browser cross-site requests", () => {
    const result = guardExpensiveRequest(
      request({
        origin: "https://attacker.test",
        "sec-fetch-site": "cross-site",
      }),
      "screen",
      2,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("rate limits repeated requests by forwarded client address", () => {
    const req = request({ "x-forwarded-for": "203.0.113.9" });
    expect(guardExpensiveRequest(req, "screen", 2).ok).toBe(true);
    expect(guardExpensiveRequest(req, "screen", 2).ok).toBe(true);
    const blocked = guardExpensiveRequest(req, "screen", 2);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.status).toBe(429);
  });
});
