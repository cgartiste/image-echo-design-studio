import { describe, expect, it } from "vitest";
import { estimateAudience, followupDueAt } from "@/lib/followups";

describe("follow-ups", () => {
  it("is due delay hours after the parent ends", () => {
    expect(followupDueAt({ started_at: "2026-10-20T08:00:00Z", ended_at: "2026-10-20T10:00:00Z" }, 48)?.toISOString()).toBe("2026-10-22T10:00:00.000Z");
    expect(followupDueAt({ started_at: null, ended_at: null }, 48)).toBeNull();
  });
  it("estimates audiences from parent stats", () => {
    const p = { delivered: 1000, opens: 300, clicks: 40 };
    expect(estimateAudience("non_openers", p)).toBe(700);
    expect(estimateAudience("non_clickers", p)).toBe(260);
    expect(estimateAudience("clickers", p)).toBe(40);
  });
});
