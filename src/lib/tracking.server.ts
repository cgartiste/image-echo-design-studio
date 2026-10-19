// Server-only: records opens, clicks and unsubscribes from signed tracking tokens.
import { admin, verifyToken } from "./agent.server";

export async function loadJob(token: string) {
  const p = await verifyToken(token);
  if (!p) return null;
  const db = await admin();
  const { data: job } = await db.from("send_jobs").select("id,campaign_id,email,is_test,opened_at,clicked_at,subscriber_id").eq("id", p.j).maybeSingle();
  return job ? { job, url: p.u, db } : null;
}
const meta = (r: Request) => ({ ip: r.headers.get("cf-connecting-ip"), user_agent: (r.headers.get("user-agent") ?? "").slice(0, 300) });

export async function recordOpen(token: string, request: Request) {
  const t = await loadJob(token); if (!t) return;
  const { job, db } = t;
  if (!job.opened_at) {
    const { data } = await db.from("send_jobs").update({ opened_at: new Date().toISOString() }).eq("id", job.id).is("opened_at", null).select("id");
    if (data?.length && !job.is_test) await db.rpc("bump_campaign_stat", { _cid: job.campaign_id, _field: "opens", _n: 1 });
  }
  await db.from("send_events").insert({ job_id: job.id, campaign_id: job.campaign_id, kind: "open", ...meta(request) });
  if (job.subscriber_id) await db.from("subscribers").update({ last_open_at: new Date().toISOString() }).eq("id", job.subscriber_id);
}

export async function recordClick(token: string, request: Request) {
  const t = await loadJob(token); if (!t?.url || !/^https?:\/\//.test(t.url)) return null;
  const { job, db } = t;
  const now = new Date().toISOString();
  if (!job.clicked_at) {
    const { data } = await db.from("send_jobs").update({ clicked_at: now }).eq("id", job.id).is("clicked_at", null).select("id");
    if (data?.length && !job.is_test) await db.rpc("bump_campaign_stat", { _cid: job.campaign_id, _field: "clicks", _n: 1 });
  }
  if (!job.opened_at) {
    const { data } = await db.from("send_jobs").update({ opened_at: now }).eq("id", job.id).is("opened_at", null).select("id");
    if (data?.length && !job.is_test) await db.rpc("bump_campaign_stat", { _cid: job.campaign_id, _field: "opens", _n: 1 });
  }
  await db.from("send_events").insert({ job_id: job.id, campaign_id: job.campaign_id, kind: "click", url: t.url.slice(0, 2000), ...meta(request) });
  if (job.subscriber_id) await db.from("subscribers").update({ last_click_at: now }).eq("id", job.subscriber_id);
  return t.url;
}

export async function unsubscribe(token: string, request: Request) {
  const t = await loadJob(token); if (!t) return false;
  const { job, db } = t;
  const { data: already } = await db.from("send_events").select("id").eq("job_id", job.id).eq("kind", "unsubscribe").limit(1);
  if (!job.is_test) await db.from("subscribers").update({ unsubscribed: true, status: "unsubscribed" }).ilike("email", job.email);
  if (!already?.length) {
    await db.from("send_events").insert({ job_id: job.id, campaign_id: job.campaign_id, kind: "unsubscribe", ...meta(request) });
    if (!job.is_test) await db.rpc("bump_campaign_stat", { _cid: job.campaign_id, _field: "unsubscribes", _n: 1 });
  }
  return true;
}

export const htmlPage = (status: number, body: string) =>
  new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Email preferences</title></head><body style="font-family:system-ui;max-width:480px;margin:60px auto;padding:0 20px;text-align:center;color:#222">${body}</body></html>`, {
    status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
