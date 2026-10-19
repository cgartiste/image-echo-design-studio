import { createFileRoute } from "@tanstack/react-router";

// Injection outcomes from the agent; finishes campaigns once their queue is empty.
export const Route = createFileRoute("/api/public/agent/jobs-result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { agentFromRequest, json } = await import("@/lib/agent.server");
        const a = await agentFromRequest(request);
        if (!a) return json({ error: "unauthorized" }, 401);
        const b = (await request.json().catch(() => ({}))) as { results?: { job_id: string; ok: boolean; error?: string }[] };
        const results = (b.results ?? []).slice(0, 1000);
        const db = a.db;
        const { data: jobs } = await db.from("send_jobs").select("id,campaign_id,attempts,is_test").in("id", results.map((r) => r.job_id)).eq("server_id", a.server.id);
        const sentBy: Record<string, number> = {};
        for (const r of results) {
          const j = jobs?.find((x) => x.id === r.job_id); if (!j) continue;
          if (r.ok) {
            await db.from("send_jobs").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", j.id);
            if (!j.is_test) sentBy[j.campaign_id] = (sentBy[j.campaign_id] ?? 0) + 1;
          } else {
            await db.from("send_jobs").update({ status: j.attempts >= 3 ? "failed" : "queued", error: String(r.error ?? "").slice(0, 300) }).eq("id", j.id);
            await db.from("send_events").insert({ job_id: j.id, campaign_id: j.campaign_id, kind: "inject_failed", detail: String(r.error ?? "").slice(0, 300) });
          }
        }
        for (const [cid, n] of Object.entries(sentBy)) await db.rpc("bump_campaign_stat", { _cid: cid, _field: "sent", _n: n });
        for (const cid of new Set(jobs?.map((j) => j.campaign_id))) {
          const { count } = await db.from("send_jobs").select("id", { count: "exact", head: true }).eq("campaign_id", cid).eq("is_test", false).in("status", ["queued", "sending"]);
          if (!count) {
            const { data: done } = await db.from("campaigns").update({ status: "completed", ended_at: new Date().toISOString() }).eq("id", cid).eq("status", "running").select("id");
            if (done?.length) await db.from("campaign_logs").insert({ campaign_id: cid, level: "info", message: "All messages handed to KumoMTA", action: "complete" });
          }
        }
        return json({ ok: true });
      },
    },
  },
});
