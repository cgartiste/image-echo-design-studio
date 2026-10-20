import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { actionLabels, buildSeedQuery, classifyPlacement, SEED_ACTIONS, type Placement } from "./seed-placement";

type Ctx = { supabase: any; userId: string; claims: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const GATEWAY = "https://connector-gateway.lovable.dev";
const CONNECTOR = "google_mail";
const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

async function requirePerm(ctx: Ctx, action: string) {
  const { data } = await ctx.supabase.rpc("has_permission", { _module: "servers", _action: action });
  if (!data) throw new Error("You don't have permission for this action");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
async function audit(admin: any, ctx: Ctx, action: string, details: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  await admin.from("activity_logs").insert({ user_id: ctx.userId, user_email: ctx.claims?.email ?? null, module: "seeds", action, details: details.slice(0, 500) });
}

class ReconnectError extends Error {}

async function gmail(admin: any, seed: { id: string; connection_key_ciphertext: string | null }, path: string, init?: RequestInit) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!seed.connection_key_ciphertext) throw new ReconnectError("Not connected");
  const { decryptConnectionKey } = await import("./connection-key-crypto.server");
  const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY, connectorId: CONNECTOR, connectionAPIKey: decryptConnectionKey(seed.connection_key_ciphertext),
    path: `/gmail/v1/users/me${path}`, init, requiredScopes: SCOPES,
  });
  if (await appUserReconnectRequired(res)) {
    await admin.from("seed_accounts").update({ reconnect_required: true, status: "reconnect", updated_at: new Date().toISOString() }).eq("id", seed.id);
    throw new ReconnectError("Access expired — reconnect this inbox");
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`Gmail call failed [${res.status}]: ${body}`);
    throw new Error(`Gmail error ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

async function loadSeeds(admin: any, ids?: string[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
  let q = admin.from("seed_accounts").select("id,email,label,connection_key_ciphertext,reconnect_required").not("connection_key_ciphertext", "is", null);
  if (ids?.length) q = q.in("id", ids);
  const { data } = await q;
  return (data ?? []) as { id: string; email: string | null; label: string; connection_key_ciphertext: string; reconnect_required: boolean }[];
}

const header = (m: any, n: string) => (m?.payload?.headers ?? []).find((h: any) => h.name?.toLowerCase() === n.toLowerCase())?.value ?? ""; // eslint-disable-line @typescript-eslint/no-explicit-any
const meta = (m: any) => ({ id: m.id as string, subject: header(m, "Subject"), from: header(m, "From"), date: header(m, "Date"), snippet: (m.snippet ?? "") as string, unread: (m.labelIds ?? []).includes("UNREAD"), starred: (m.labelIds ?? []).includes("STARRED"), placement: classifyPlacement(m.labelIds) as Placement }); // eslint-disable-line @typescript-eslint/no-explicit-any
const META_Q = "?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&fields=id,labelIds,snippet,payload/headers";

async function listMessages(admin: any, seed: any, q: string, max: number) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const list = await gmail(admin, seed, `/messages?maxResults=${max}&includeSpamTrash=true&q=${encodeURIComponent(q)}`);
  const ids: string[] = (list?.messages ?? []).map((m: { id: string }) => m.id);
  const out = [];
  for (const id of ids) out.push(meta(await gmail(admin, seed, `/messages/${id}${META_Q}`)));
  return out;
}

// ---------- accounts ----------
export const listSeeds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requirePerm(context as Ctx, "view");
    const { data } = await admin.from("seed_accounts").select("id,label,email,status,reconnect_required,last_error,last_checked_at,created_at,connection_key_ciphertext").order("created_at");
    return (data ?? []).map(({ connection_key_ciphertext, ...r }) => ({ ...r, connected: !!connection_key_ciphertext && !r.reconnect_required }));
  });

export const startSeedConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ seedId: z.string().uuid().optional(), label: z.string().trim().max(80).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "settings");
    const clientKey = process.env["GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientKey) throw new Error("Gmail connection is not configured for this project");
    let seedId = data.seedId;
    let existingKey: string | undefined;
    if (seedId) {
      const { data: s } = await admin.from("seed_accounts").select("connection_key_ciphertext").eq("id", seedId).single();
      if (!s) throw new Error("Seed inbox not found");
      if (s.connection_key_ciphertext) existingKey = (await import("./connection-key-crypto.server")).decryptConnectionKey(s.connection_key_ciphertext);
    } else {
      const { data: row, error } = await admin.from("seed_accounts").insert({ label: data.label || "Gmail seed", created_by: context.userId }).select("id").single();
      if (error) throw new Error(error.message);
      seedId = row.id as string;
    }
    const request = getRequest();
    if (!request) throw new Error("OAuth must start from an app request.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL("/api/oauth/google/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    // Each seed inbox is its own gateway identity, so one Cortex user can connect many Gmail accounts.
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY, connectorId: CONNECTOR, appUserId: seedId!, clientAPIKey: clientKey, returnUrl,
      connectionAPIKey: existingKey, credentialsConfiguration: { scopes: SCOPES },
    });
    return { authorizationUrl, seedId: seedId! };
  });

export const completeSeedConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ seedId: z.string().uuid(), code: z.string().min(1).max(2000).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "settings");
    if (!data.code) throw new Error("Google did not return a connection code (offline access disabled)");
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY, data.code);
    if (connectorId !== CONNECTOR) throw new Error("OAuth completion returned the wrong connector");
    const { encryptConnectionKey } = await import("./connection-key-crypto.server");
    const ciphertext = encryptConnectionKey(connectionAPIKey);
    const seed = { id: data.seedId, connection_key_ciphertext: ciphertext };
    const profile = await gmail(admin, seed, "/profile");
    const email = (profile?.emailAddress as string) ?? null;
    const { error } = await admin.from("seed_accounts").update({
      connection_key_ciphertext: ciphertext, email, status: "connected", reconnect_required: false, last_error: null, updated_at: new Date().toISOString(),
    }).eq("id", data.seedId);
    if (error) throw new Error(error.message);
    await audit(admin, context as Ctx, "connect_seed", email ?? data.seedId);
    return { email };
  });

export const deleteSeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ seedId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "settings");
    const { data: s } = await admin.from("seed_accounts").select("email,connection_key_ciphertext").eq("id", data.seedId).single();
    if (!s) throw new Error("Seed inbox not found");
    if (s.connection_key_ciphertext) {
      const { decryptConnectionKey } = await import("./connection-key-crypto.server");
      const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
      try { await disconnectAppUser({ gatewayBaseUrl: GATEWAY, connectorId: CONNECTOR, connectionAPIKey: decryptConnectionKey(s.connection_key_ciphertext) }); }
      catch (e) { console.error(e); }
    }
    await admin.from("seed_accounts").delete().eq("id", data.seedId);
    await audit(admin, context as Ctx, "remove_seed", s.email ?? data.seedId);
    return { ok: true };
  });

// ---------- inbox reading ----------
export const seedMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ seedId: z.string().uuid(), folder: z.enum(["inbox", "spam", "promotions", "all"]), search: z.string().max(200).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "view");
    const [seed] = await loadSeeds(admin, [data.seedId]);
    if (!seed) throw new Error("This inbox is not connected");
    const base = { inbox: "in:inbox category:primary", spam: "in:spam", promotions: "category:promotions", all: "in:anywhere" }[data.folder];
    const q = `${base} ${(data.search ?? "").replace(/["\\]/g, "")}`.trim();
    return listMessages(admin, seed, q, 20);
  });

export const readSeedMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ seedId: z.string().uuid(), messageId: z.string().regex(/^[a-zA-Z0-9]+$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "view");
    const [seed] = await loadSeeds(admin, [data.seedId]);
    if (!seed) throw new Error("This inbox is not connected");
    const m = await gmail(admin, seed, `/messages/${data.messageId}?format=full`);
    const parts: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const walk = (p: any) => { if (!p) return; parts.push(p); (p.parts ?? []).forEach(walk); }; // eslint-disable-line @typescript-eslint/no-explicit-any
    walk(m.payload);
    const decode = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
    const html = parts.find((p) => p.mimeType === "text/html" && p.body?.data);
    const text = parts.find((p) => p.mimeType === "text/plain" && p.body?.data);
    const auth = header(m, "Authentication-Results");
    return {
      ...meta(m), to: header(m, "To"), html: html ? decode(html.body.data) : null, text: text ? decode(text.body.data) : null,
      auth: { spf: /spf=(\w+)/i.exec(auth)?.[1] ?? null, dkim: /dkim=(\w+)/i.exec(auth)?.[1] ?? null, dmarc: /dmarc=(\w+)/i.exec(auth)?.[1] ?? null },
      listUnsubscribe: header(m, "List-Unsubscribe") || null,
    };
  });

// ---------- placement + rescue ----------
export const checkPlacement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ subject: z.string().max(200).optional(), from: z.string().max(200).optional(), days: z.number().int().min(1).max(30) }).refine((v) => v.subject?.trim() || v.from?.trim(), "Enter a subject or a sender").parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "view");
    const q = buildSeedQuery(data);
    const seeds = await loadSeeds(admin);
    const results = [];
    for (const s of seeds) {
      try {
        const messages = await listMessages(admin, s, q, 5);
        results.push({ seedId: s.id, email: s.email, messages, error: null as string | null });
      } catch (e) {
        results.push({ seedId: s.id, email: s.email, messages: [], error: e instanceof Error ? e.message : String(e) });
      }
      await admin.from("seed_accounts").update({ last_checked_at: new Date().toISOString() }).eq("id", s.id);
    }
    await audit(admin, context as Ctx, "placement_check", `${q} · ${seeds.length} inboxes`);
    return { query: q, results };
  });

export const seedAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    action: z.enum(SEED_ACTIONS),
    items: z.array(z.object({ seedId: z.string().uuid(), messageId: z.string().regex(/^[a-zA-Z0-9]+$/) })).min(1).max(200),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "execute");
    const bySeed = new Map<string, string[]>();
    for (const i of data.items) bySeed.set(i.seedId, [...(bySeed.get(i.seedId) ?? []), i.messageId]);
    const seeds = await loadSeeds(admin, [...bySeed.keys()]);
    const op = actionLabels(data.action);
    let done = 0; const errors: string[] = [];
    for (const s of seeds) {
      const ids = bySeed.get(s.id) ?? [];
      try {
        if (op === "trash") for (const id of ids) await gmail(admin, s, `/messages/${id}/trash`, { method: "POST" });
        else await gmail(admin, s, "/messages/batchModify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, addLabelIds: op.add, removeLabelIds: op.remove }) });
        done += ids.length;
      } catch (e) { errors.push(`${s.email}: ${e instanceof Error ? e.message : e}`); }
    }
    await audit(admin, context as Ctx, `seed_${data.action}`, `${done} messages${errors.length ? ` · ${errors.length} errors` : ""}`);
    return { done, errors };
  });
