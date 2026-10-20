import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string; claims: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function perm(ctx: Ctx, action: string) {
  const { data } = await ctx.supabase.rpc("has_permission", { _module: "servers", _action: action });
  if (!data) throw new Error("You don't have permission for this action");
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
const audit = (db: any, ctx: Ctx, action: string, details: string) => // eslint-disable-line @typescript-eslint/no-explicit-any
  db.from("activity_logs").insert({ user_id: ctx.userId, user_email: ctx.claims?.email ?? null, module: "deliverability", action, details: details.slice(0, 500) });

const ACCOUNT_COLS = "id,name,status,last_error,last_sync_at,is_vip,pool_status,region,daily_quota,sent_today,max_send_rate,bounce_rate,complaint_rate,production_access,routing_priority";

export const deliverabilityState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await perm(context as Ctx, "view");
    const [{ data: accounts }, { data: controls }, { data: alerts }, { data: events }, { data: vip }] = await Promise.all([
      db.from("provider_accounts").select(ACCOUNT_COLS).eq("provider", "aws_ses").order("routing_priority"),
      db.from("system_controls").select("*").single(),
      db.from("alerts").select("*").is("resolved_at", null).order("created_at", { ascending: false }).limit(100),
      db.from("routing_events").select("*").order("created_at", { ascending: false }).limit(50),
      db.from("vip_clients").select("id,company,ses_account_id,backup_account_id").order("company"),
    ]);
    return { accounts: accounts ?? [], controls, alerts: alerts ?? [], events: events ?? [], vipClients: vip ?? [] };
  });

export const setEmergencyStop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ on: z.boolean(), reason: z.string().trim().max(300) }).refine((v) => !v.on || v.reason.length > 2, "Give a reason").parse(d))
  .handler(async ({ data, context }) => {
    const db = await perm(context as Ctx, "settings");
    await db.from("system_controls").update({ emergency_stop: data.on, reason: data.on ? data.reason : null, changed_by: context.userId, changed_at: new Date().toISOString() }).eq("id", true);
    if (data.on) await db.from("mta_servers").update({ paused: true }).eq("paused", false);
    await db.from("alerts").insert({ level: data.on ? "critical" : "info", source: "emergency_stop", message: data.on ? `Emergency stop activated: ${data.reason}` : "Emergency stop lifted — servers stay paused until resumed individually" });
    await audit(db, context as Ctx, data.on ? "emergency_stop_on" : "emergency_stop_off", data.reason);
    return { ok: true };
  });

export const saveThresholds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bounce: z.number().min(0.1).max(50), complaint: z.number().min(0.01).max(5) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await perm(context as Ctx, "settings");
    await db.from("system_controls").update({ bounce_threshold: data.bounce, complaint_threshold: data.complaint }).eq("id", true);
    await audit(db, context as Ctx, "thresholds", `bounce ${data.bounce}% · complaint ${data.complaint}%`);
    return { ok: true };
  });

export const updateRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(), routing_priority: z.number().int().min(1).max(1000),
    bounce_rate: z.number().min(0).max(100).nullable(), complaint_rate: z.number().min(0).max(100).nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await perm(context as Ctx, "settings");
    const { id, ...patch } = data;
    const { error } = await db.from("provider_accounts").update(patch).eq("id", id).eq("provider", "aws_ses");
    if (error) throw new Error(error.message);
    await audit(db, context as Ctx, "routing_update", `${id} · priority ${data.routing_priority}`);
    return { ok: true };
  });

export const resolveAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await perm(context as Ctx, "execute");
    await db.from("alerts").update({ resolved_at: new Date().toISOString(), resolved_by: context.userId }).eq("id", data.id);
    return { ok: true };
  });

/** Pulls quota/status from every SES account and imports SES-suppressed addresses into the global list. */
export const syncSesHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await perm(context as Ctx, "execute");
    const { data: accounts } = await db.from("provider_accounts").select("id,name,credentials_encrypted").eq("provider", "aws_ses");
    const { decryptCreds } = await import("./providers.server");
    const { sesClient } = await import("./ses.server");
    const results: { name: string; ok: boolean; message: string }[] = [];
    let imported = 0;
    for (const a of accounts ?? []) {
      try {
        const c = await decryptCreds(a.credentials_encrypted);
        const call = sesClient({ access_key_id: c["access_key_id"]!, secret_access_key: c["secret_access_key"]!, region: c["region"] || "us-east-1" });
        const acct = await call("GET", "/v2/email/account");
        const q = acct.SendQuota ?? {};
        await db.from("provider_accounts").update({
          status: "ok", last_error: null, last_sync_at: new Date().toISOString(), region: c["region"] || null,
          daily_quota: Math.round(q.Max24HourSend ?? 0) || null, sent_today: Math.round(q.SentLast24Hours ?? 0), max_send_rate: q.MaxSendRate ?? null,
          production_access: !!acct.ProductionAccessEnabled,
        }).eq("id", a.id);
        const enforcement = String(acct.EnforcementStatus ?? "HEALTHY");
        if (enforcement !== "HEALTHY") await db.from("alerts").insert({ level: enforcement === "SHUTDOWN" ? "critical" : "warning", source: "ses_account", ref_id: a.id, message: `${a.name}: AWS enforcement status ${enforcement}` });
        if (acct.SendingEnabled === false) await db.from("alerts").insert({ level: "critical", source: "ses_account", ref_id: a.id, message: `${a.name}: sending is disabled by AWS` });
        if (q.Max24HourSend && q.SentLast24Hours / q.Max24HourSend >= 0.9) await db.from("alerts").insert({ level: "warning", source: "quota", ref_id: a.id, message: `${a.name}: ${Math.round((q.SentLast24Hours / q.Max24HourSend) * 100)}% of 24h quota used` });
        const supp = await call("GET", "/v2/email/suppression/addresses?PageSize=1000").catch(() => ({ SuppressedDestinationSummaries: [] }));
        const rows = (supp.SuppressedDestinationSummaries ?? []).map((s: { EmailAddress: string; Reason: string }) => ({
          email: String(s.EmailAddress).trim().toLowerCase(), reason: s.Reason === "COMPLAINT" ? "complaint" : "hard_bounce", source: `ses:${a.name}`,
        }));
        if (rows.length) {
          const { count } = await db.from("suppressions").upsert(rows, { onConflict: "email", ignoreDuplicates: true, count: "exact" });
          imported += count ?? 0;
        }
        results.push({ name: a.name, ok: true, message: `${enforcement} · ${Math.round(q.SentLast24Hours ?? 0)}/${Math.round(q.Max24HourSend ?? 0)} today` });
      } catch (e) {
        const msg = (e as Error).message.slice(0, 300);
        await db.from("provider_accounts").update({ status: "error", last_error: msg }).eq("id", a.id);
        await db.from("alerts").insert({ level: "warning", source: "ses_account", ref_id: a.id, message: `${a.name}: sync failed — ${msg}` });
        results.push({ name: a.name, ok: false, message: msg });
      }
    }
    await audit(db, context as Ctx, "ses_health_sync", `${results.length} accounts · ${imported} suppressions imported`);
    return { results, imported };
  });
