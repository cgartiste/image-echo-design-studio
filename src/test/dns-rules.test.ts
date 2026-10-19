import { describe, expect, it } from "vitest";
import { buildRecords, evaluateDmarc, evaluateSpf, replacesRecord, scoreChecks } from "@/lib/dns-records";

describe("deliverability rules", () => {
  it("a domain is verified only when SPF, DKIM and DMARC all pass", () => {
    expect(scoreChecks({ spf: { ok: true, value: "" }, dkim: { ok: true, value: "" }, dmarc: { ok: true, value: "" } }).status).toBe("verified");
    expect(scoreChecks({ spf: { ok: true, value: "" }, dmarc: { ok: true, value: "" } }).status).toBe("action_required");
  });
  it("rejects multiple SPF records and +all", () => {
    expect(evaluateSpf(["v=spf1 -all", "v=spf1 ~all"]).ok).toBe(false);
    expect(evaluateSpf(["v=spf1 +all"]).ok).toBe(false);
    expect(evaluateSpf(["v=spf1 ip4:1.2.3.4 -all"]).ok).toBe(true);
  });
  it("requires a DMARC policy", () => {
    expect(evaluateDmarc(["v=DMARC1; rua=mailto:x@y.com"]).ok).toBe(false);
  });
  it("builds SPF with ips and includes", () => {
    const [spf] = buildRecords("ex.com", { spf: { ips: ["1.2.3.4"], includes: ["_spf.google.com"], policy: "-all" } });
    expect(spf!.content).toBe("v=spf1 ip4:1.2.3.4 include:_spf.google.com -all");
  });
  it("a new SPF replaces the old SPF but not other TXT records", () => {
    const next = { type: "TXT", name: "ex.com", content: "v=spf1 -all", ttl: 300 };
    expect(replacesRecord({ type: "TXT", name: "ex.com", content: '"v=spf1 ~all"', ttl: 300 }, next)).toBe(true);
    expect(replacesRecord({ type: "TXT", name: "ex.com", content: "google-site-verification=abc", ttl: 300 }, next)).toBe(false);
  });
});
