import { describe, expect, it } from "vitest";
import { planRoute, type RoutableAccount } from "@/lib/routing";

const acc = (o: Partial<RoutableAccount>): RoutableAccount => ({ id: "x", name: "x", is_vip: false, pool_status: "available", status: "ok", routing_priority: 100, daily_quota: 1000, sent_today: 0, bounce_rate: null, complaint_rate: null, ...o });
const t = { bounce: 5, complaint: 0.1 };

describe("SES routing", () => {
  it("never routes standard campaigns through VIP accounts", () => {
    const r = planRoute([acc({ id: "v", is_vip: true }), acc({ id: "s" })], { volume: 10 }, t);
    expect(r.plan.map((s) => s.account.id)).toEqual(["s"]);
  });
  it("uses the VIP primary then backup only", () => {
    const r = planRoute([acc({ id: "p", is_vip: true }), acc({ id: "b" }), acc({ id: "o" })], { volume: 10, vipClient: { ses_account_id: "p", backup_account_id: "b" } }, t);
    expect(r.plan.map((s) => s.role)).toEqual(["primary", "backup"]);
  });
  it("skips an account whose daily quota is used up", () => {
    const r = planRoute([acc({ id: "a", daily_quota: 100, sent_today: 100 })], { volume: 1 }, t);
    expect(r.rejected[0]?.reason).toBe("Daily quota reached");
  });
  it("skips an account at the complaint threshold", () => {
    expect(planRoute([acc({ complaint_rate: 0.1 })], { volume: 1 }, t).plan).toHaveLength(0);
  });
  it("orders the pool by priority and flags missing capacity", () => {
    const r = planRoute([acc({ id: "b", routing_priority: 20, daily_quota: 50 }), acc({ id: "a", routing_priority: 10, daily_quota: 50 })], { volume: 200 }, t);
    expect(r.plan.map((s) => s.account.id)).toEqual(["a", "b"]);
    expect(r.enough).toBe(false);
  });
});
