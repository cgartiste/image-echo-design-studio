import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LOGIN_DRIVERS, PLATFORMS, detectSuppressionSource, parseSubs, suppressionDownloadUrl } from "./sponsor-platforms";

type Ctx = { supabase: any; userId: string; claims: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const PUBLIC_COLS = "id,name,platform,api_driver,login_driver,affiliate_id,api_url,report_url,login_url,home_url,tracking_template,has_password,has_api_key,status,last_error,last_test_at,last_offer_sync_at,last_conversion_sync_at,created_at";

async function perm(ctx: Ctx, action: string) {
  const { data } = await ctx.supabase.rpc("has_permission", { _module: "offers", _action: action });
  if (!data) throw new Error("You don't have permission for this action");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
async function log(admin: any, ctx: Ctx, sponsorId: string, kind: string, level: string, message: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const msg = message.slice(0, 500);
  await admin.from("sponsor_events").insert({ sponsor_id: sponsorId, kind, level, message: msg });
  await admin.from("activity_logs").insert({ user_id: ctx.userId, user_email: ctx.claims?.email ?? null, module: "offers", action: kind, details: msg });
}
async function load(admin: any, id: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await admin.from("sponsors").select("*").eq("id", id).single();
  if (!data) throw new Error("Sponsor not found");
  const { decryptCreds } = await import("./providers.server");
  const creds = data.credentials_encrypted ? await decryptCreds(data.credentials_encrypted) : {};
  return { sp: data, creds: creds as { username?: string; password?: string; api_key?: string } };
}
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
const id = z.object({ id: z.string().uuid() });

export const listSponsors = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const admin = await perm(context as Ctx, "view");
  const { data } = await admin.from("sponsors").select(PUBLIC_COLS).order("name");
  return (data ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
});

export const getSponsor = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => id.parse(d)).handler(async ({ data, context }) => {
  const admin = await perm(context as Ctx, "view");
  const { data: row } = await admin.from("sponsors").select(PUBLIC_COLS).eq("id", data.id).single();
  if (!row) throw new Error("Sponsor not found");
  return row as any; // eslint-disable-line @typescript-eslint/no-explicit-any
});

const sponsorInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  platform: z.enum(Object.keys(PLATFORMS) as [string, ...string[]]),
  login_driver: z.enum(Object.keys(LOGIN_DRIVERS) as [string, ...string[]]),
  affiliate_id: z.string().max(100).optional().default(""),
  api_url: z.string().max(300).optional().default(""),
  report_url: z.string().max(300).optional().default(""),
  login_url: z.string().max(300).optional().default(""),
  home_url: z.string().max(300).optional().default(""),
  tracking_template: z.string().max(500).optional().default(""),
  username: z.string().max(200).optional(),
  password: z.string().max(500).optional(),
  api_key: z.string().max(1000).optional(),
});

export const saveSponsor = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => sponsorInput.parse(d)).handler(async ({ data, context }) => {
  const admin = await perm(context as Ctx, data.id ? "edit" : "create");
  for (const u of [data.login_url, data.home_url, data.api_url]) if (u && !/^https:\/\//.test(u)) throw new Error("URLs must start with https://");
  const { encryptCreds } = await import("./providers.server");
  let creds: Record<string, string> = {};
  if (data.id) creds = (await load(admin, data.id)).creds as Record<string, string>;
  for (const k of ["username", "password", "api_key"] as const) if (data[k]) creds[k] = data[k]!;
  const p = PLATFORMS[data.platform]!;
  const row = {
    name: data.name, platform: data.platform, api_driver: p.apiDriver, login_driver: data.login_driver,
    affiliate_id: data.affiliate_id || null, api_url: data.api_url || null, report_url: data.report_url || null,
    login_url: data.login_url || null, home_url: data.home_url || null, tracking_template: data.tracking_template || p.trackingFormat,
    credentials_encrypted: await encryptCreds(creds), has_password: !!creds["password"], has_api_key: !!creds["api_key"],
  };
  let sid = data.id;
  if (sid) { const { error } = await admin.from("sponsors").update(row).eq("id", sid); if (error) throw new Error(error.message); }
  else { const { data: r, error } = await admin.from("sponsors").insert({ ...row, created_by: context.userId }).select("id").single(); if (error) throw new Error(error.message); sid = r.id; }
  await log(admin, context as Ctx, sid!, data.id ? "edit_sponsor" : "create_sponsor", "info", `${data.name} (${p.label})${data.password || data.api_key ? " — credentials updated" : ""}`);
  return { id: sid! };
});

export const deleteSponsor = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => id.parse(d)).handler(async ({ data, context }) => {
  const admin = await perm(context as Ctx, "delete");
  await admin.from("sponsors").delete().eq("id", data.id);
  await admin.from("activity_logs").insert({ user_id: context.userId, user_email: (context as Ctx).claims?.email ?? null, module: "offers", action: "delete_sponsor", details: data.id });
  return { ok: true };
});

export const testSponsor = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => id.parse(d)).handler(async ({ data, context }) => {
  const admin = await perm(context as Ctx, "execute");
  const { sp, creds } = await load(admin, data.id);
  const checks: { name: string; ok: boolean; message: string }[] = [];
  if (sp.api_driver !== "none") {
    try { const { apiAdapter } = await import("./sponsors.server"); checks.push({ name: "API", ok: true, message: await apiAdapter(sp, creds).testCredentials() }); }
    catch (e) { checks.push({ name: "API", ok: false, message: err(e) }); }
  }
  if (sp.login_driver !== "none") {
    if (!sp.login_url || !creds.username || !creds.password) checks.push({ name: "Login", ok: false, message: "Login URL, username or password missing" });
    else {
      try { const r = await fetch(sp.login_url, { redirect: "follow" }); const html = await r.text();
        const captcha = /recaptcha|hcaptcha|turnstile/i.test(html);
        checks.push({ name: "Login page", ok: r.ok, message: r.ok ? (captcha ? "Reachable — CAPTCHA detected, auto-login may require manual step" : "Login page reachable") : `HTTP ${r.status}` });
      } catch (e) { checks.push({ name: "Login page", ok: false, message: `provider_unavailable: ${err(e)}` }); }
    }
  }
  const ok = checks.length > 0 && checks.every((c) => c.ok);
  await admin.from("sponsors").update({ status: ok ? "connected" : "error", last_error: ok ? null : checks.find((c) => !c.ok)?.message ?? "Nothing to test", last_test_at: new Date().toISOString() }).eq("id", data.id);
  await log(admin, context as Ctx, data.id, "test_connection", ok ? "info" : "error", checks.map((c) => `${c.name}: ${c.message}`).join(" · ") || "Nothing to test");
  return { ok, checks };
});

export const fetchOffers = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => id.parse(d)).handler(async ({ data, context }) => {
  const admin = await perm(context as Ctx, "create");
  const { sp, creds } = await load(admin, data.id);
  const { apiAdapter } = await import("./sponsors.server");
  try {
    const offers = await apiAdapter(sp, creds).getOffers();
    const now = new Date().toISOString();
    for (let i = 0; i < offers.length; i += 200) {
      const { error } = await admin.from("offers").upsert(offers.slice(i, i + 200).map((o) => ({ ...o, sponsor_id: sp.id, updated_at: now })), { onConflict: "sponsor_id,external_id", ignoreDuplicates: false });
      if (error) throw new Error(error.message);
    }
    await admin.from("sponsors").update({ last_offer_sync_at: now, status: "connected", last_error: null }).eq("id", sp.id);
    await log(admin, context as Ctx, sp.id, "get_offers", "info", `${offers.length} offers fetched`);
    return { count: offers.length };
  } catch (e) { await log(admin, context as Ctx, sp.id, "get_offers", "error", err(e)); throw new Error(err(e)); }
});

export const importOffers = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(1000), assign: z.boolean() }).parse(d)).handler(async ({ data, context }) => {
  const admin = await perm(context as Ctx, "create");
  const { error } = await admin.from("offers").update({ imported: true, ...(data.assign ? { assigned_to: context.userId } : {}) }).in("id", data.ids);
  if (error) throw new Error(error.message);
  await admin.from("activity_logs").insert({ user_id: context.userId, user_email: (context as Ctx).claims?.email ?? null, module: "offers", action: "add_offers", details: `${data.ids.length} offers imported` });
  return { count: data.ids.length };
});

export const syncConversions = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ id: z.string().uuid(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d)).handler(async ({ data, context }) => {
  const admin = await perm(context as Ctx, "execute");
  const { sp, creds } = await load(admin, data.id);
  const { apiAdapter } = await import("./sponsors.server");
  try {
    const rows = await apiAdapter(sp, creds).getConversions(data.from, data.to);
    const mapped = rows.map((c) => { const p = parseSubs(c.sub1, c.sub2, c.sub3); return { ...c, sponsor_id: sp.id, user_ref: p.user, offer_ref: p.offer, campaign_ref: p.campaign, list_ref: p.list, subscriber_ref: p.email, interface_ref: p.interface }; });
    for (let i = 0; i < mapped.length; i += 500) { const { error } = await admin.from("conversions").upsert(mapped.slice(i, i + 500), { onConflict: "sponsor_id,external_id" }); if (error) throw new Error(error.message); }
    await admin.from("sponsors").update({ last_conversion_sync_at: new Date().toISOString() }).eq("id", sp.id);
    await log(admin, context as Ctx, sp.id, "get_conversion_report", "info", `${rows.length} conversions ${data.from} → ${data.to}`);
    return { count: rows.length, revenue: rows.reduce((a, r) => a + r.payout, 0) };
  } catch (e) { await log(admin, context as Ctx, sp.id, "get_conversion_report", "error", err(e)); throw new Error(err(e)); }
});

export const fetchSuppression = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ offerId: z.string().uuid(), manualUrl: z.string().url().max(1000).optional() }).parse(d)).handler(async ({ data, context }) => {
  const admin = await perm(context as Ctx, "execute");
  const { data: offer } = await admin.from("offers").select("id,sponsor_id,external_id,name").eq("id", data.offerId).single();
  if (!offer) throw new Error("Offer not found");
  let link = data.manualUrl ?? null;
  if (!link) {
    const { sp, creds } = await load(admin, offer.sponsor_id);
    const { apiAdapter } = await import("./sponsors.server");
    try { link = await apiAdapter(sp, creds).getSuppressionLink(offer.external_id); }
    catch (e) { await log(admin, context as Ctx, offer.sponsor_id, "get_suppression_link", "error", err(e)); throw new Error(err(e)); }
  }
  if (!link) throw new Error("The network did not return a suppression link for this offer — paste one manually.");
  const row = { sponsor_id: offer.sponsor_id, offer_id: offer.id, source_url: link, source_type: detectSuppressionSource(link), download_url: suppressionDownloadUrl(link) };
  await admin.from("suppression_files").insert(row);
  await log(admin, context as Ctx, offer.sponsor_id, "get_suppression_link", "info", `${offer.name}: ${row.source_type}`);
  return row;
});

export const createLoginSession = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => id.parse(d)).handler(async ({ data, context }) => {
  const admin = await perm(context as Ctx, "execute");
  const { sp, creds } = await load(admin, data.id);
  if (sp.login_driver === "none" || !sp.login_url) throw new Error("Auto-login is not configured for this sponsor");
  if (!creds.username || !creds.password) throw new Error("Username and password are required for auto-login");
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const { sha256 } = await import("./sponsors.server");
  const { data: s, error } = await admin.from("sponsor_login_sessions").insert({
    sponsor_id: sp.id, user_id: context.userId, user_email: (context as Ctx).claims?.email ?? null, token_hash: await sha256(token), expires_at: new Date(Date.now() + 2 * 60_000).toISOString(),
  }).select("id").single();
  if (error) throw new Error(error.message);
  await log(admin, context as Ctx, sp.id, "auto_login_session", "info", `One-time login link created (expires in 2 min)`);
  return { token, sessionId: s.id as string };
});

export const reportLoginResult = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid(), result: z.enum(["success", "failed", "requires_2fa", "requires_captcha", "invalid_credentials", "provider_unavailable", "unknown_error"]) }).parse(d)).handler(async ({ data, context }) => {
  const admin = await perm(context as Ctx, "execute");
  const { data: s } = await admin.from("sponsor_login_sessions").select("id,sponsor_id,user_id").eq("id", data.sessionId).single();
  if (!s || s.user_id !== context.userId) throw new Error("Session not found");
  await admin.from("sponsor_login_sessions").update({ result: data.result }).eq("id", s.id);
  await log(admin, context as Ctx, s.sponsor_id, "auto_login_result", data.result === "success" ? "info" : "warn", `Login result: ${data.result}`);
  return { ok: true };
});
