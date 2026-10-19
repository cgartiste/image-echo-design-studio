import { describe, expect, it } from "vitest";
import { availableActions, nextStatus, canEditCampaign, CAMPAIGN_STATUSES } from "@/lib/campaign-status";
import { campaignRates, parseSettings, publicationChecks, maskEmails } from "@/lib/campaign-model";
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
  it("includes every required lifecycle status", () => {
    expect(CAMPAIGN_STATUSES).toEqual(["draft","ready","scheduled","publishing","running","paused","stopping","stopped","completed","failed","cancelled","archived","test","waiting_approval"]);
  });
  it("locks running content", () => { expect(canEditCampaign("running")).toBe(false); });
  it("locks completed content", () => { expect(canEditCampaign("completed")).toBe(false); });
  it("stopping preserves the distinction from completed", () => { expect(nextStatus("running","stop")).toBe("stopped"); });
});

describe("campaign safety and metric formulas", () => {
  const c={sent:1000,delivered:800,opens:400,clicks:80,bounces:20,unsubscribes:8,conversions:4};
  it("open rate uses delivered",()=>expect(campaignRates(c).open).toBe(50));
  it("CTR uses delivered",()=>expect(campaignRates(c).ctr).toBe(10));
  it("bounce rate uses sent",()=>expect(campaignRates(c).bounce).toBe(2));
  it("unsubscribe rate uses delivered",()=>expect(campaignRates(c).unsubscribe).toBe(1));
  it("conversion rate uses clicks",()=>expect(campaignRates(c).conversion).toBe(5));
  it("blocks publication without a server or queue",()=>{
    const checks=publicationChecks({name:"Launch",subject:"Offer",from_email:"a@example.com",html_content:'<a href="{{unsubscribe_url}}">Unsubscribe</a>',handle_unsubscribes:true,settings:parseSettings({bounce_email:"bounce@example.com"})},100,true);
    expect(checks.filter(c=>["server","interface","queue"].includes(c.key)).map(c=>c.ok)).toEqual([false,false,false]);
  });
  it("masks recipient email addresses in logs",()=>expect(maskEmails("Sent to john@example.com")).toBe("Sent to j***@example.com"));
});

describe("html validation", () => {
  it("requires an unsubscribe link", () => {
    expect(validateHtml("<p>Hi</p>")).toContain("Missing mandatory {{unsubscribe_url}} link");
  });
  it("flags unknown variables", () => {
    expect(validateHtml('<a href="{{unsubscribe_url}}">x</a>{{foo}}')).toEqual(["Unknown variable {{foo}}"]);
  });
});
