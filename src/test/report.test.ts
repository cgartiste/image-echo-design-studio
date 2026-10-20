import { describe, expect, it } from "vitest";
import { reportTotals } from "@/lib/report";

describe("management report", () => {
  it("sums campaigns and computes profit, ROI and rates", () => {
    const base = { opens: 0, clicks: 0, complaints: 0, conversions: 0 };
    const t = reportTotals([
      { ...base, sent: 1000, delivered: 950, bounces: 50, revenue: 300, cost: 100, opens: 190 },
      { ...base, sent: 1000, delivered: 1000, bounces: 0, revenue: 100, cost: 100, complaints: 1 },
    ]);
    expect(t.profit).toBe(200);
    expect(t.roi).toBe(100);
    expect(t.bounceRate).toBe(2.5);
    expect(t.openRate).toBe(9.74);
    expect(t.complaintRate).toBe(0.05);
  });
  it("has no ROI without cost", () => {
    expect(reportTotals([]).roi).toBeNull();
  });
});
