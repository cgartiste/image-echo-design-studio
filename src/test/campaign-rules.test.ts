import { describe, expect, it } from "vitest";
import { availableActions, nextStatus } from "@/lib/campaign-status";
import { validateHtml } from "@/lib/format";

describe("campaign status rules", () => {
  it("running campaigns can be paused, stopped or cancelled", () => {
    expect(availableActions("running").sort()).toEqual(["cancel", "pause", "stop"]);
  });
  it("paused campaigns resume to running", () => {
    expect(nextStatus("paused", "resume")).toBe("running");
  });
  it("completed campaigns cannot be started", () => {
    expect(() => nextStatus("completed", "start")).toThrow();
  });
});

describe("html validation", () => {
  it("requires an unsubscribe link", () => {
    expect(validateHtml("<p>Hi</p>")).toContain("Missing mandatory {{unsubscribe_url}} link");
  });
  it("flags unknown variables", () => {
    expect(validateHtml('<a href="{{unsubscribe_url}}">x</a>{{foo}}')).toEqual(["Unknown variable {{foo}}"]);
  });
});
