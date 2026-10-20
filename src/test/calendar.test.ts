import { describe, expect, it } from "vitest";
import { campaignDay, monthGrid } from "@/lib/calendar";

describe("campaign calendar", () => {
  it("starts weeks on Monday", () => {
    const g = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(g[0]).toBe("2026-09-28");
    expect(g[3]).toBe("2026-10-01");
    expect(g).toHaveLength(42);
  });
  it("places a campaign on its scheduled date first", () => {
    expect(campaignDay({ scheduled_at: "2026-10-22T08:00:00Z", started_at: "2026-10-23T08:00:00Z", created_at: "2026-10-01T00:00:00Z" })).toBe("2026-10-22");
    expect(campaignDay({ scheduled_at: null, started_at: null, created_at: "2026-10-01T00:00:00Z" })).toBe("2026-10-01");
  });
});
