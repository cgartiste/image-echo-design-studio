import { createFileRoute } from "@tanstack/react-router";

type KumoRecord = { type?: string; recipient?: string; headers?: Record<string, string>; response?: { code?: number; content?: string }; feedback_report?: unknown };

// KumoMTA log hook (JSON webhook): deliveries, bounces and complaints.
export const Route = createFileRoute("/api/public/agent/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { agentFromRequest, json } = await import("@/lib/agent.server");
        const a = await agentFromRequest(request);
        if (!a) return json({ error: "unauthorized" }, 401);
        const raw = await request.json().catch(() => null);
        const records: KumoRecord[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
        const db = a.db;
        for (const r of records.slice(0, 500)) {
          const jobId = r.headers?.["X-Cortex-Job"] ?? r.headers?.["x-cortex-job"];
          if (!jobId || !/^[0-9a-f-]{36}$/.test(jobId)) continue;
          const { data: j } = await db.from("send_jobs").select("id,campaign_id,email,is_test,status").eq("id", jobId).maybeSingle();
          if (!j) continue;
          const detail = `${r.response?.code ?? ""} ${r.response?.content ?? ""}`.trim().slice(0, 300);
          if (r.type === "Delivery") {
            if (j.status === "delivered") continue;
            await db.from("send_jobs").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("id", j.id);
            if (!j.is_test) await db.rpc("bump_campaign_stat", { _cid: j.campaign_id, _field: "delivered", _n: 1 });
            await db.from("send_events").insert({ job_id: j.id, campaign_id: j.campaign_id, kind: "delivered", detail });
          } else if (r.type === "Bounce" || r.type === "Feedback") {
            const complaint = r.type === "Feedback";
            await db.from("send_jobs").update({ status: complaint ? "complaint" : "bounced", error: detail }).eq("id", j.id);
            if (!j.is_test) {
              await db.rpc("bump_campaign_stat", { _cid: j.campaign_id, _field: complaint ? "complaints" : "bounces", _n: 1 });
              await db.from("subscribers").update({ status: complaint ? "complained" : "bounced" }).ilike("email", j.email);
            }
            await db.from("send_events").insert({ job_id: j.id, campaign_id: j.campaign_id, kind: complaint ? "complaint" : "bounce", detail });
          } else if (r.type === "TransientFailure") {
            await db.from("send_events").insert({ job_id: j.id, campaign_id: j.campaign_id, kind: "deferred", detail });
          }
        }
        return json({ ok: true });
      },
    },
  },
});
