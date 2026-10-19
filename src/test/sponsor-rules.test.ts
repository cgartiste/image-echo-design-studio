import { describe, expect, it } from "vitest";
import { buildTrackingLink, detectSuppressionSource, LOGIN_DRIVERS, parseSubs, suppressionDownloadUrl, validateTrackingTemplate, PLATFORMS } from "@/lib/sponsor-platforms";

describe("sponsor rules", () => {
  it("builds HitPath path-style links", () => {
    expect(buildTrackingLink("https://t.com/x/", PLATFORMS.hitpath!.trackingFormat, { user: "1", offer: "2", campaign: "3", list: "4", email: "5", interface: "6" })).toBe("https://t.com/x/1/2-3/4-5-6");
  });
  it("builds Everflow query links onto URLs that already have params", () => {
    expect(buildTrackingLink("https://t.com/?a=1", PLATFORMS.everflow!.trackingFormat, { user: "1", offer: "2", campaign: "3", list: "4", email: "5", interface: "6" })).toBe("https://t.com/?a=1&sub1=1&sub2=2-3&sub3=4-5-6");
  });
  it("parses subs back to references", () => {
    expect(parseSubs("1", "2-3", "4-5-6")).toEqual({ user: "1", offer: "2", campaign: "3", list: "4", email: "5", interface: "6" });
  });
  it("flags templates missing required variables", () => {
    expect(validateTrackingTemplate("?sub1=[user]")).toContain("Missing [email]");
  });
  it("detects suppression sources and converts Google Sheets to CSV", () => {
    expect(detectSuppressionSource("https://mailer.optizmo.net/x")).toBe("optizmo");
    expect(suppressionDownloadUrl("https://docs.google.com/spreadsheets/d/AbC_1/edit")).toBe("https://docs.google.com/spreadsheets/d/AbC_1/export?format=csv");
  });
  it("includes BlueStats as an official login driver", () => {
    expect(LOGIN_DRIVERS.bluestats!.fields("u", "p")).toEqual({ username: "u", password: "p" });
  });
});
