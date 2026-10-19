import { describe, expect, it } from "vitest";
import { buildInitLua, DEFAULT_CONFIG, isOnline, parseBulkServers, parseConfig, pollQuota } from "@/lib/kumo-config";
import { publicationChecks, parseSettings } from "@/lib/campaign-model";

describe("KumoMTA delivery rules", () => {
  it("splits the hourly speed across online servers per 10-second poll", () => {
    // 3600/h = 60/min = 10 per poll, shared by 2 servers = 5
    expect(pollQuota({ sendSpeedPerHour: 3600, minuteLimit: 1000, batchSize: 100, onlineServers: 2, sentToday: 0, dailyLimit: null })).toBe(5);
  });
  it("stops at the daily limit", () => {
    expect(pollQuota({ sendSpeedPerHour: 36000, minuteLimit: 1000, batchSize: 100, onlineServers: 1, sentToday: 500, dailyLimit: 500 })).toBe(0);
    expect(pollQuota({ sendSpeedPerHour: 36000, minuteLimit: 1000, batchSize: 100, onlineServers: 1, sentToday: 497, dailyLimit: 500 })).toBe(3);
  });
  it("respects the per-minute limit and batch size", () => {
    expect(pollQuota({ sendSpeedPerHour: 1_000_000, minuteLimit: 60, batchSize: 100, onlineServers: 1, sentToday: 0, dailyLimit: null })).toBe(10);
    expect(pollQuota({ sendSpeedPerHour: 1_000_000, minuteLimit: 100000, batchSize: 50, onlineServers: 1, sentToday: 0, dailyLimit: null })).toBe(50);
  });
  it("treats a server as offline after 90 seconds without heartbeat", () => {
    const now = Date.now();
    expect(isOnline(new Date(now - 30_000).toISOString(), now)).toBe(true);
    expect(isOnline(new Date(now - 120_000).toISOString(), now)).toBe(false);
    expect(isOnline(null, now)).toBe(false);
  });
  it("parses bulk server lines", () => {
    const r = parseBulkServers("mta-01, 203.0.113.10, warmup\n203.0.113.12\nbad line");
    expect(r[0]).toMatchObject({ name: "mta-01", ip: "203.0.113.10", pool: "warmup", valid: true });
    expect(r[1]).toMatchObject({ name: "203.0.113.12", pool: "default", valid: true });
    expect(r[2]!.valid).toBe(false);
  });
  it("rejects invalid config values", () => {
    expect(parseConfig({ max_message_rate: "fast", max_connections: -1 })).toEqual(DEFAULT_CONFIG);
  });
  it("keeps the injection API on localhost and relays through SES on 587 when linked", () => {
    const direct = buildInitLua({ hostname: "mta1.example.com", eventsUrl: "https://x/e", cfg: DEFAULT_CONFIG });
    expect(direct).toContain("listen = '127.0.0.1:8000'");
    expect(direct).not.toContain("smtp_port");
    const relay = buildInitLua({ hostname: "mta1.example.com", eventsUrl: "https://x/e", cfg: DEFAULT_CONFIG, relay: { host: "email-smtp.eu-west-3.amazonaws.com", username: "AKIA", password: "p'w" } });
    expect(relay).toContain("smtp_port = 587");
    expect(relay).toContain("enable_tls = 'Required'");
    expect(relay).toContain("'p\\'w'");
  });
  it("publication requires an online server", () => {
    const v = { name: "n", subject: "s", from_email: "a@b.co", html_content: "<a href='{{unsubscribe_url}}'>u</a>", handle_unsubscribes: true, settings: parseSettings({ bounce_email: "b@b.co" }) };
    expect(publicationChecks(v, 10, true).find((c) => c.key === "server")!.ok).toBe(false);
    expect(publicationChecks(v, 10, true, 1).every((c) => c.ok)).toBe(true);
  });
});

describe("tracking tokens", () => {
  it("rejects tampered tokens", async () => {
    process.env["DNS_CREDENTIALS_KEY"] = "test-key";
    const { signToken, verifyToken } = await import("@/lib/agent.server");
    const id = "11111111-2222-3333-4444-555555555555";
    const t = await signToken({ j: id, u: "https://example.com" });
    expect(await verifyToken(t)).toEqual({ j: id, u: "https://example.com" });
    const [body, sig] = t.split(".");
    expect(await verifyToken(`${body}x.${sig}`)).toBeNull();
  });
});
