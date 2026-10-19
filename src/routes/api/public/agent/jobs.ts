import { createFileRoute } from "@tanstack/react-router";

// Hands the calling KumoMTA server a rate-limited batch of rendered messages.
export const Route = createFileRoute("/api/public/agent/jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { agentFromRequest, json, renderJob } = await import("@/lib/agent.server");
        const a = await agentFromRequest(request);
        if (!a) return json({ error: "unauthorized" }, 401);
        if (a.server.paused) return json({ messages: [], limit: 0 });
        const { pollQuota, isOnline } = await import("@/lib/kumo-config");
        const { parseSettings } = await import("@/lib/campaign-model");
        const db = a.db;
        const pool = a.server.pool;

        // Pick the oldest running campaign in this pool (tests first) to compute a quota.
        const { data: peers } = await db.from("mta_servers").select("last_seen_at,paused").eq("pool", pool);
        const online = (peers ?? []).filter((p) => !p.paused && isOnline(p.last_seen_at)).length || 1;
        const { data: running } = await db.from("campaigns").select("id,send_speed,daily_limit,settings,server_pool").eq("status", "running");
        const inPool = (running ?? []).filter((c) => (c.server_pool || "default") === pool);
        let limit = 20; let delay = 0;
        if (inPool.length) {
          const c = inPool[0]!; const s = parseSettings(c.settings);
          const today = new Date(); today.setUTCHours(0, 0, 0, 0);
          const { count } = await db.from("send_jobs").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("status", "sent").gte("sent_at", today.toISOString());
          limit = pollQuota({ sendSpeedPerHour: c.send_speed, minuteLimit: s.delivery.minute_limit, batchSize: s.delivery.batch_size, onlineServers: online, sentToday: count ?? 0, dailyLimit: c.daily_limit });
          delay = s.delivery.message_delay;
        }
        if (limit <= 0) return json({ messages: [], limit: 0 });
        const { data: jobs, error } = await db.rpc("claim_send_jobs", { _server: a.server.id, _limit: limit });
        if (error) return json({ error: error.message }, 500);
        if (!jobs?.length) return json({ messages: [], limit });

        const campaignIds = [...new Set(jobs.map((j) => j.campaign_id))];
        const subIds = jobs.map((j) => j.subscriber_id).filter(Boolean) as string[];
        const [{ data: camps }, { data: subs }] = await Promise.all([
          db.from("campaigns").select("*,email_lists(name)").in("id", campaignIds),
          subIds.length ? db.from("subscribers").select("id,first_name,last_name,country,city").in("id", subIds) : Promise.resolve({ data: [] as never[] }),
        ]);
        const origin = new URL(request.url).origin;
        const messages = [];
        for (const j of jobs) {
          const c = camps?.find((x) => x.id === j.campaign_id);
          if (!c) continue;
          const sub = subs?.find((x) => x.id === j.subscriber_id) ?? null;
          const m = await renderJob({ job: j, campaign: c, sub, listName: (c.email_lists as { name?: string } | null)?.name ?? "", origin });
          if (m.variant) await db.from("send_jobs").update({ variant: m.variant }).eq("id", j.id);
          messages.push(m);
        }
        return json({ messages, limit, delay_ms: delay });
      },
    },
  },
});
