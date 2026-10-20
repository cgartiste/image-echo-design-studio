import { describe, expect, it } from "vitest";
import { matchesVipFilter } from "@/lib/vip-recipients";
describe("tracked VIP qualification", () => {
  it("includes recipients who clicked", () => expect(matchesVipFilter({ clicked_messages: 1, conversions: 0 }, "all")).toBe(true));
  it("includes recipients who converted without a tracked click", () => expect(matchesVipFilter({ clicked_messages: 0, conversions: 1 }, "all")).toBe(true));
  it("excludes recipients with neither a click nor a conversion", () => expect(matchesVipFilter({ clicked_messages: 0, conversions: 0 }, "all")).toBe(false));
  it("does not label a click alone as a conversion", () => expect(matchesVipFilter({ clicked_messages: 1, conversions: 0 }, "conversions")).toBe(false));
});