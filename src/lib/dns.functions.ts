import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildRecords, evaluateDkim, evaluateDmarc, evaluateSpf, replacesRecord, scoreChecks,
  type DnsRecord, type DomainChecks, type TemplateOptions,
} from "./dns-records";
import { PROVIDERS } from "./provider-meta";

type Ctx = { supabase: any; userId: string; claims: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function requirePerm(ctx: Ctx, action: string) {
  const { data } = await ctx.supabase.rpc("has_permission", { _module: "domains", _action: action });
  if (!data) throw new Error("You don't have permission for this action");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
async function audit(admin: any, ctx: Ctx, action: string, details: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  await admin.from("activity_logs").insert({ user_id: ctx.userId, user_email: ctx.claims?.email ?? null, module: "domains", action, details: details.slice(0, 500) });
}
async function loadAccount(admin: any, id: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data, error } = await admin.from("provider_accounts").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Account not found");
  const { decryptCreds } = await import("./providers.server");
  return { ...data, creds: await decryptCreds(data.credentials_encrypted) };
}
async function domainContext(admin: any, domainId: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: d } = await admin.from("domains").select("*").eq("id", domainId).single();
  if (!d) throw new Error("Domain not found");
  if (!d.account_id) throw new Error("This domain is not linked to a DNS provider account");
  const acc = await loadAccount(admin, d.account_id);
  const { dnsAdapter } = await import("./providers.server");
  return { domain: d, adapter: dnsAdapter(acc.provider, acc.creds), zone: { name: d.name, ref: d.zone_ref ?? d.name, nameservers: d.nameservers } };
}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- accounts ----------
export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requirePerm(context as Ctx, "view");
    const { data } = await admin.from("provider_accounts").select("id,name,provider,status,last_error,last_sync_at,created_at").order("created_at");
    return data ?? [];
  });

export const saveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(1).max(80), provider: z.enum(Object.keys(PROVIDERS) as [string, ...string[]]), creds: z.record(z.string().max(4000)) }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "settings");
    const needed = PROVIDERS[data.provider]!.fields.filter((f) => f.id !== "region" && f.id !== "email").map((f) => f.id);
    for (const f of needed) if (!data.creds[f]?.trim()) throw new Error(`Missing ${f}`);
    const { encryptCreds } = await import("./providers.server");
    const { data: row, error } = await admin.from("provider_accounts").insert({
      name: data.name, provider: data.provider, credentials_encrypted: await encryptCreds(data.creds), created_by: context.userId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    await audit(admin, context as Ctx, "add_account", `${data.provider}: ${data.name}`);
    return { id: row.id as string };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "settings");
    await admin.from("provider_accounts").delete().eq("id", data.id);
    await audit(admin, context as Ctx, "delete_account", data.id);
    return { ok: true };
  });

export const testAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "execute");
    const acc = await loadAccount(admin, data.id);
    const p = await import("./providers.server");
    try {
      const msg = PROVIDERS[acc.provider]!.kind === "dns" ? await p.dnsAdapter(acc.provider, acc.creds).test() : await p.rdnsAdapter(acc.provider, acc.creds).test();
      await admin.from("provider_accounts").update({ status: "connected", last_error: null }).eq("id", data.id);
      return { ok: true, message: msg };
    } catch (e) {
      await admin.from("provider_accounts").update({ status: "error", last_error: errMsg(e).slice(0, 500) }).eq("id", data.id);
      return { ok: false, message: errMsg(e) };
    }
  });

export const syncAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "execute");
    const acc = await loadAccount(admin, data.id);
    const { dnsAdapter } = await import("./providers.server");
    try {
      const zones = await dnsAdapter(acc.provider, acc.creds).listZones();
      for (let i = 0; i < zones.length; i += 200) {
        const rows = zones.slice(i, i + 200).map((z) => ({ name: z.name, account_id: acc.id, provider: acc.provider, zone_ref: z.ref, nameservers: z.nameservers }));
        const { error } = await admin.from("domains").upsert(rows, { onConflict: "name" });
        if (error) throw new Error(error.message);
      }
      await admin.from("provider_accounts").update({ status: "connected", last_error: null, last_sync_at: new Date().toISOString() }).eq("id", acc.id);
      await audit(admin, context as Ctx, "sync_domains", `${acc.name}: ${zones.length} domains`);
      return { count: zones.length };
    } catch (e) {
      await admin.from("provider_accounts").update({ status: "error", last_error: errMsg(e).slice(0, 500) }).eq("id", acc.id);
      throw e;
    }
  });

// ---------- records ----------
const recordSchema = z.object({
  id: z.string().max(2000).optional(),
  type: z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"]),
  name: z.string().trim().min(1).max(253),
  content: z.string().min(1).max(4096),
  ttl: z.number().int().min(1).max(86400),
  priority: z.number().int().min(0).max(65535).optional(),
});
const clean = (r: z.infer<typeof recordSchema>): DnsRecord => ({ type: r.type, name: r.name, content: r.content, ttl: r.ttl, ...(r.id ? { id: r.id } : {}), ...(r.priority != null ? { priority: r.priority } : {}) });

export const getRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ domainId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "view");
    const { adapter, zone } = await domainContext(admin, data.domainId);
    return adapter.listRecords(zone);
  });

export const saveRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ domainId: z.string().uuid(), record: recordSchema, replace: recordSchema.optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "edit");
    const { adapter, zone, domain } = await domainContext(admin, data.domainId);
    await adapter.upsert(zone, clean(data.record), data.replace ? clean(data.replace) : undefined);
    await audit(admin, context as Ctx, "dns_upsert", `${domain.name} ${data.record.type} ${data.record.name}`);
    return { ok: true };
  });

export const deleteRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ domainId: z.string().uuid(), record: recordSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "delete");
    const { adapter, zone, domain } = await domainContext(admin, data.domainId);
    await adapter.remove(zone, clean(data.record));
    await audit(admin, context as Ctx, "dns_delete", `${domain.name} ${data.record.type} ${data.record.name}`);
    return { ok: true };
  });

const templateSchema = z.object({
  spf: z.object({ ips: z.array(z.string().max(64)).max(50), includes: z.array(z.string().max(253)).max(10), policy: z.enum(["~all", "-all"]) }).optional(),
  dkim: z.object({ selector: z.string().regex(/^[a-z0-9-]{1,63}$/i), publicKey: z.string().regex(/^[A-Za-z0-9+/=]{100,}$/) }).optional(),
  dmarc: z.object({ policy: z.enum(["none", "quarantine", "reject"]), rua: z.string().email().optional(), pct: z.number().int().min(1).max(100).optional() }).optional(),
  mtaSts: z.object({ id: z.string().regex(/^[A-Za-z0-9]{1,32}$/) }).optional(),
  tlsRpt: z.object({ rua: z.string().email() }).optional(),
  bimi: z.object({ logoUrl: z.string().url().startsWith("https://") }).optional(),
  returnPath: z.object({ sub: z.string().regex(/^[a-z0-9-]{1,63}$/i), target: z.string().max(253) }).optional(),
  mx: z.object({ host: z.string().max(253), priority: z.number().int().min(0).max(65535) }).optional(),
});

/** Apply a deliverability template to many domains, replacing the matching existing records. */
export const applyTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ domainIds: z.array(z.string().uuid()).min(1).max(25), template: templateSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "edit");
    const results: { domainId: string; ok: boolean; message: string }[] = [];
    for (const id of data.domainIds) {
      try {
        const { adapter, zone, domain } = await domainContext(admin, id);
        const existing = await adapter.listRecords(zone);
        const recs = buildRecords(domain.name, data.template as TemplateOptions, 3600);
        for (const r of recs) await adapter.upsert(zone, r, existing.find((e) => replacesRecord(e, r)));
        if (data.template.dkim) await admin.from("domains").update({ dkim_selector: data.template.dkim.selector }).eq("id", id);
        await audit(admin, context as Ctx, "dns_template", `${domain.name}: ${recs.length} records`);
        results.push({ domainId: id, ok: true, message: `${recs.length} records published` });
      } catch (e) {
        results.push({ domainId: id, ok: false, message: errMsg(e) });
      }
    }
    return results;
  });

export const setNameservers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ domainId: z.string().uuid(), nameservers: z.array(z.string().trim().min(3).max(253)).min(2).max(4) }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "settings");
    const { adapter, zone, domain } = await domainContext(admin, data.domainId);
    if (!adapter.setNameservers) throw new Error("This provider cannot change nameservers");
    await adapter.setNameservers(zone, data.nameservers);
    await admin.from("domains").update({ nameservers: data.nameservers }).eq("id", data.domainId);
    await audit(admin, context as Ctx, "set_nameservers", `${domain.name} → ${data.nameservers.join(", ")}`);
    return { ok: true };
  });

export const generateDkimKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePerm(context as Ctx, "edit");
    const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
    const pub = b64(await crypto.subtle.exportKey("spki", kp.publicKey));
    const priv = b64(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
    return { publicKey: pub, privatePem: `-----BEGIN PRIVATE KEY-----\n${priv.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n` };
  });

// ---------- checks ----------
export const checkDomains = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(25) }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "execute");
    const { lookup } = await import("./providers.server");
    const { data: doms } = await admin.from("domains").select("id,name,dkim_selector").in("id", data.ids);
    await Promise.all((doms ?? []).map(async (d: { id: string; name: string; dkim_selector: string }) => {
      const [root, dmarc, dkim, mx, sts, rpt, bimi, bounce, ns] = await Promise.all([
        lookup(d.name, "TXT"), lookup(`_dmarc.${d.name}`, "TXT"), lookup(`${d.dkim_selector}._domainkey.${d.name}`, "TXT"),
        lookup(d.name, "MX"), lookup(`_mta-sts.${d.name}`, "TXT"), lookup(`_smtp._tls.${d.name}`, "TXT"),
        lookup(`default._bimi.${d.name}`, "TXT"), lookup(`bounce.${d.name}`, "CNAME"), lookup(d.name, "NS"),
      ]);
      const has = (arr: string[], p: string) => arr.find((t) => t.toLowerCase().startsWith(p.toLowerCase())) ?? null;
      const checks: DomainChecks = {
        spf: evaluateSpf(root), dmarc: evaluateDmarc(dmarc), dkim: evaluateDkim(dkim),
        mx: mx.length ? { ok: true, value: mx.join(", ") } : { ok: false, value: null, issue: "No MX record" },
        mta_sts: has(sts, "v=STSv1") ? { ok: true, value: has(sts, "v=STSv1") } : { ok: false, value: null, issue: "No MTA-STS record" },
        tls_rpt: has(rpt, "v=TLSRPTv1") ? { ok: true, value: has(rpt, "v=TLSRPTv1") } : { ok: false, value: null, issue: "No TLS-RPT record" },
        bimi: has(bimi, "v=BIMI1") ? { ok: true, value: has(bimi, "v=BIMI1") } : { ok: false, value: null, issue: "No BIMI record" },
        return_path: bounce.length ? { ok: true, value: `bounce → ${bounce[0]}` } : { ok: false, value: null, issue: "No bounce.<domain> CNAME" },
      };
      const { score, status } = scoreChecks(checks);
      await admin.from("domains").update({ checks, score, status, nameservers: ns.map((n) => n.replace(/\.$/, "")), last_checked_at: new Date().toISOString() }).eq("id", d.id);
    }));
    return { checked: doms?.length ?? 0 };
  });

// ---------- reverse DNS ----------
export const setRdns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ipId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "execute");
    const { data: ip } = await admin.from("sending_ips").select("*").eq("id", data.ipId).single();
    if (!ip?.account_id || !ip.hostname) throw new Error("Set a hostname and a hosting account first");
    const acc = await loadAccount(admin, ip.account_id);
    const { rdnsAdapter } = await import("./providers.server");
    const msg = await rdnsAdapter(acc.provider, acc.creds).setPtr(ip.ip, ip.hostname);
    await audit(admin, context as Ctx, "set_rdns", `${ip.ip} → ${ip.hostname} (${msg})`);
    return { message: msg };
  });

export const checkRdns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requirePerm(context as Ctx, "execute");
    const { lookup } = await import("./providers.server");
    const { data: ips } = await admin.from("sending_ips").select("id,ip,hostname").in("id", data.ids);
    await Promise.all((ips ?? []).map(async (r: { id: string; ip: string; hostname: string | null }) => {
      const arpa = r.ip.split(".").reverse().join(".") + ".in-addr.arpa";
      const ptr = (await lookup(arpa, "PTR"))[0]?.replace(/\.$/, "") ?? null;
      // Forward-confirmed rDNS: PTR matches hostname and hostname resolves back to the IP.
      const fwd = r.hostname ? await lookup(r.hostname, "A") : [];
      const ok = !!ptr && !!r.hostname && ptr.toLowerCase() === r.hostname.toLowerCase() && fwd.includes(r.ip);
      await admin.from("sending_ips").update({ ptr_current: ptr, rdns_ok: ok, last_checked_at: new Date().toISOString() }).eq("id", r.id);
    }));
    return { checked: ips?.length ?? 0 };
  });
