import { describe, expect, it } from "vitest";
import { hoursToResolve, statusPatch } from "@/lib/incidents";

describe("incidents", () => {
  it("measures time to resolve in hours", () => {
    expect(hoursToResolve({ created_at: "2026-10-20T08:00:00Z", resolved_at: "2026-10-20T11:30:00Z" })).toBe(3.5);
    expect(hoursToResolve({ created_at: "2026-10-20T08:00:00Z", resolved_at: null })).toBeNull();
  });
  it("stamps resolution time only when resolved", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    expect(statusPatch("resolved", now).resolved_at).toBe("2026-10-20T12:00:00.000Z");
    expect(statusPatch("investigating", now).resolved_at).toBeNull();
  });
});
