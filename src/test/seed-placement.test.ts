import { describe, expect, it } from "vitest";
import { actionLabels, buildSeedQuery, classifyPlacement, inboxRate } from "@/lib/seed-placement";

describe("seed placement", () => {
  it("spam label wins over inbox", () => expect(classifyPlacement(["INBOX", "SPAM"])).toBe("spam"));
  it("promotions tab is not primary inbox", () => expect(classifyPlacement(["INBOX", "CATEGORY_PROMOTIONS"])).toBe("promotions"));
  it("plain inbox is inbox", () => expect(classifyPlacement(["INBOX", "UNREAD"])).toBe("inbox"));
  it("inbox rate counts only primary inbox", () => expect(inboxRate(["inbox", "spam", "promotions", "inbox"])).toBe(50));
  it("inbox rate is null with nothing found", () => expect(inboxRate([])).toBeNull());
  it("query limits days to 30 and strips quotes", () => expect(buildSeedQuery({ subject: 'Hi "there"', days: 90 })).toBe('in:anywhere newer_than:30d subject:"Hi there"'));
  it("rescue removes spam and adds inbox", () => expect(actionLabels("rescue")).toEqual({ add: ["INBOX", "IMPORTANT"], remove: ["SPAM", "CATEGORY_PROMOTIONS"] }));
});
