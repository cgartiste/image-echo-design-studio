// Server-only: agent authentication, tracking tokens and per-recipient rendering.
import { parseSettings } from "./campaign-model";
import { renderCampaignPreview } from "./campaign-model";
import { spin } from "./spintax";

export const sha256 = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, "0")).join("");

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Resolves the calling agent from `Authorization: Bearer <token>` or `?t=`. */
export async function agentFromRequest(request: Request) {
  const url = new URL(request.url);
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || url.searchParams.get("t") || "";
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const db = await admin();
  const { data } = await db.from("mta_servers").select("*").eq("agent_token_hash", await sha256(token)).maybeSingle();
  return data ? { server: data, token, db } : null;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// ---------- tracking tokens (HMAC-signed, stateless) ----------
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function hmacKey() {
  const secret = process.env["DNS_CREDENTIALS_KEY"];
  if (!secret) throw new Error("Signing key missing");
  return crypto.subtle.importKey("raw", new TextEncoder().encode("cortex-tracking:" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
export async function signToken(payload: { j: string; u?: string }) {
  const body = b64u(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(body))).slice(0, 16);
  return `${body}.${b64u(sig)}`;
}
export async function verifyToken(token: string): Promise<{ j: string; u?: string } | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const expected = b64u(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(body))).slice(0, 16));
    if (expected !== sig) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64u(body)));
    return typeof p?.j === "string" && /^[0-9a-f-]{36}$/.test(p.j) ? p : null;
  } catch { return null; }
}

// ---------- rendering ----------
const hashSeed = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

type Campaign = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Sub = { first_name?: string | null; last_name?: string | null; country?: string | null; city?: string | null } | null;

export async function renderJob(o: { job: { id: string; email: string; is_test: boolean }; campaign: Campaign; sub: Sub; listName: string; origin: string }) {
  const { job, campaign: c, sub } = o;
  const s = parseSettings(c.settings);
  const seed = hashSeed(job.id);
  const base = (s.tracking_domain ? `https://${s.tracking_domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}` : o.origin);
  const tok = await signToken({ j: job.id });
  const unsub = `${base}/api/public/u/${tok}`;
  const webview = `${base}/api/public/w/${tok}`;

  let subject = c.subject as string, fromName = (c.from_name ?? "") as string, html = c.html_content as string, variant: string | null = null;
  if (s.ab.enabled && s.ab.variants.length >= 2) {
    const i = seed % s.ab.variants.length; const v = s.ab.variants[i]!;
    variant = v.name || `Variant ${i + 1}`;
    if (v.subject) subject = v.subject; if (v.from_name) fromName = v.from_name; if (v.html) html = v.html;
  }
  if (lines(s.random.subjects).length) subject = lines(s.random.subjects)[seed % lines(s.random.subjects).length]!;
  if (lines(s.random.from_names).length) fromName = lines(s.random.from_names)[(seed >>> 3) % lines(s.random.from_names).length]!;
  if (s.random.spintax) { subject = spin(subject, seed); html = spin(html, seed + 1); fromName = spin(fromName, seed + 2); }

  const vars: Record<string, string> = {
    first_name: sub?.first_name ?? "", last_name: sub?.last_name ?? "", email: job.email, country: sub?.country ?? "", city: sub?.city ?? "",
    list_name: o.listName, offer_name: c.offer ?? "", unsubscribe_url: unsub, webview_url: webview, campaign_id: c.id,
    from_name: fromName, from_email: c.from_email ?? "", subject,
  };
  subject = renderCampaignPreview(subject, vars).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  html = renderCampaignPreview(html, vars);
  if (s.legal_text || s.postal_address) html += `<div style="font-size:11px;color:#888;margin-top:24px">${[s.legal_text, s.postal_address].filter(Boolean).join("<br>")}</div>`;

  if (c.track_clicks) {
    const links: string[] = [];
    html = html.replace(/href="(https?:\/\/[^"]+)"/gi, (m, url: string) => {
      if (url.startsWith(unsub) || url.startsWith(webview)) return m;
      links.push(url); return m;
    });
    for (const url of new Set(links)) {
      const target = s.url_suffix ? url + (url.includes("?") ? "&" : "?") + s.url_suffix.replace(/^[?&]/, "") : url;
      const t = await signToken({ j: job.id, u: target });
      html = html.split(`href="${url}"`).join(`href="${base}/api/public/c/${t}"`);
    }
  }
  if (c.track_opens) html += `<img src="${base}/api/public/o/${tok}.gif" width="1" height="1" alt="" style="display:none">`;
  const text = c.text_content ? renderCampaignPreview(c.text_content, vars) : html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const headers: Record<string, string> = { "X-Cortex-Job": job.id };
  if (c.handle_unsubscribes) { headers["List-Unsubscribe"] = `<${unsub}>`; headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"; }
  return {
    job_id: job.id,
    to: job.email,
    envelope_sender: s.bounce_email || (c.from_email as string),
    from: { email: c.from_email as string, name: fromName },
    reply_to: c.reply_to || undefined,
    subject: job.is_test ? `[TEST] ${subject}` : subject,
    html, text, headers, variant,
  };
}
