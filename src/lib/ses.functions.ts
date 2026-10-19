import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string; claims: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function perm(ctx: Ctx, action: string) {
  const { data } = await ctx.supabase.rpc("has_permission", { _module: "servers", _action: action });
  if (!data) throw new Error("You don't have permission for this action");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
async function client(adminDb: any, id: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await adminDb.from("provider_accounts").select("credentials_encrypted,provider").eq("id", id).single();
  if (!data || data.provider !== "aws_ses") throw new Error("SES account not found");
  const { decryptCreds } = await import("./providers.server");
  const c = await decryptCreds(data.credentials_encrypted);
  const { sesClient } = await import("./ses.server");
  return sesClient({ access_key_id: c["access_key_id"]!, secret_access_key: c["secret_access_key"]!, region: c["region"] || "us-east-1" });
}
const audit = (db: any, ctx: Ctx, action: string, details: string) => // eslint-disable-line @typescript-eslint/no-explicit-any
  db.from("activity_logs").insert({ user_id: ctx.userId, user_email: ctx.claims?.email ?? null, module: "servers", action, details: details.slice(0, 500) });
const id = z.object({ id: z.string().uuid() });

export const listSesAccounts = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await perm(context as Ctx, "view");
  const { data } = await db.from("provider_accounts").select("id,name,status,last_error,last_sync_at").eq("provider", "aws_ses").order("created_at");
  return data ?? [];
});

export const saveSesAccount = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ name: z.string().trim().min(1).max(80), access_key_id: z.string().trim().regex(/^[A-Z0-9]{16,128}$/, "Invalid access key ID"), secret_access_key: z.string().trim().min(20).max(200), region: z.string().trim().regex(/^[a-z]{2}-[a-z]+-\d$/, "Invalid region") }))
  .handler(async ({ data, context }) => {
    const db = await perm(context as Ctx, "create");
    const { sesClient } = await import("./ses.server");
    await sesClient(data)("GET", "/v2/email/account"); // validate before saving
    const { encryptCreds } = await import("./providers.server");
    const { data: row, error } = await db.from("provider_accounts").insert({
      name: data.name, provider: "aws_ses", status: "ok", last_sync_at: new Date().toISOString(), created_by: context.userId,
      credentials_encrypted: await encryptCreds({ access_key_id: data.access_key_id, secret_access_key: data.secret_access_key, region: data.region }),
    }).select("id").single();
    if (error) throw new Error(error.message);
    await audit(db, context as Ctx, "add_ses_account", `${data.name} (${data.region})`);
    return { id: row.id as string };
  });

export const deleteSesAccount = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(id).handler(async ({ data, context }) => {
  const db = await perm(context as Ctx, "delete");
  await db.from("provider_accounts").delete().eq("id", data.id).eq("provider", "aws_ses");
  await audit(db, context as Ctx, "delete_ses_account", data.id);
  return { ok: true };
});

export const sesOverview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(id).handler(async ({ data, context }) => {
  const db = await perm(context as Ctx, "view");
  const call = await client(db, data.id);
  try {
    const [account, identities, sets, suppressed] = await Promise.all([
      call("GET", "/v2/email/account"),
      call("GET", "/v2/email/identities?PageSize=100"),
      call("GET", "/v2/email/configuration-sets?PageSize=100"),
      call("GET", "/v2/email/suppression/addresses?PageSize=100").catch(() => ({ SuppressedDestinationSummaries: [] })),
    ]);
    await db.from("provider_accounts").update({ status: "ok", last_error: null, last_sync_at: new Date().toISOString() }).eq("id", data.id);
    return {
      account: {
        productionAccess: !!account.ProductionAccessEnabled, sendingEnabled: !!account.SendingEnabled, enforcement: account.EnforcementStatus ?? "",
        max24h: account.SendQuota?.Max24HourSend ?? 0, sentLast24h: account.SendQuota?.SentLast24Hours ?? 0, maxRate: account.SendQuota?.MaxSendRate ?? 0,
        suppressionReasons: account.SuppressionAttributes?.SuppressedReasons ?? [], reviewStatus: account.Details?.ReviewDetails?.Status ?? "",
      },
      identities: (identities.EmailIdentities ?? []).map((i: any) => ({ name: i.IdentityName, type: i.IdentityType, verified: i.SendingEnabled, status: i.VerificationStatus ?? "" })), // eslint-disable-line @typescript-eslint/no-explicit-any
      configurationSets: sets.ConfigurationSets ?? [],
      suppressed: (suppressed.SuppressedDestinationSummaries ?? []).map((s: any) => ({ email: s.EmailAddress, reason: s.Reason, at: s.LastUpdateTime })), // eslint-disable-line @typescript-eslint/no-explicit-any
    };
  } catch (e) {
    await db.from("provider_accounts").update({ status: "error", last_error: (e as Error).message.slice(0, 300) }).eq("id", data.id);
    throw e;
  }
});

export const sesIdentity = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), name: z.string().trim().min(3).max(253) }))
  .handler(async ({ data, context }) => {
    const db = await perm(context as Ctx, "view");
    const r = await (await client(db, data.id))("GET", `/v2/email/identities/${encodeURIComponent(data.name)}`);
    const domain = data.name.includes("@") ? data.name.split("@")[1]! : data.name;
    return {
      verified: !!r.VerifiedForSendingStatus, dkimStatus: r.DkimAttributes?.Status ?? "", mailFrom: r.MailFromAttributes?.MailFromDomain ?? "",
      dkimRecords: (r.DkimAttributes?.Tokens ?? []).map((t: string) => ({ type: "CNAME", name: `${t}._domainkey.${domain}`, value: `${t}.dkim.amazonses.com` })),
    };
  });

export const sesAction = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.discriminatedUnion("action", [
    z.object({ action: z.literal("add_identity"), id: z.string().uuid(), name: z.string().trim().min(3).max(253) }),
    z.object({ action: z.literal("delete_identity"), id: z.string().uuid(), name: z.string().trim().min(3).max(253) }),
    z.object({ action: z.literal("add_config_set"), id: z.string().uuid(), name: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/, "Letters, numbers, - and _ only") }),
    z.object({ action: z.literal("unsuppress"), id: z.string().uuid(), email: z.string().email() }),
    z.object({ action: z.literal("suppress"), id: z.string().uuid(), email: z.string().email(), reason: z.enum(["BOUNCE", "COMPLAINT"]) }),
    z.object({ action: z.literal("set_suppression"), id: z.string().uuid(), reasons: z.array(z.enum(["BOUNCE", "COMPLAINT"])) }),
    z.object({ action: z.literal("request_production"), id: z.string().uuid(), website: z.string().url(), useCase: z.string().trim().min(20).max(5000), mailType: z.enum(["MARKETING", "TRANSACTIONAL"]) }),
    z.object({ action: z.literal("send_test"), id: z.string().uuid(), from: z.string().email(), to: z.array(z.string().email()).min(1).max(10), subject: z.string().min(1).max(200), html: z.string().min(1).max(500000) }),
  ]))
  .handler(async ({ data, context }) => {
    const db = await perm(context as Ctx, data.action === "send_test" ? "execute" : "edit");
    const call = await client(db, data.id);
    let result: unknown = { ok: true };
    switch (data.action) {
      case "add_identity": result = await call("POST", "/v2/email/identities", { EmailIdentity: data.name }); break;
      case "delete_identity": await call("DELETE", `/v2/email/identities/${encodeURIComponent(data.name)}`); break;
      case "add_config_set": await call("POST", "/v2/email/configuration-sets", { ConfigurationSetName: data.name, ReputationOptions: { ReputationMetricsEnabled: true }, SendingOptions: { SendingEnabled: true } }); break;
      case "unsuppress": await call("DELETE", `/v2/email/suppression/addresses/${encodeURIComponent(data.email)}`); break;
      case "suppress": await call("PUT", "/v2/email/suppression/addresses", { EmailAddress: data.email, Reason: data.reason }); break;
      case "set_suppression": await call("PUT", "/v2/email/account/suppression", { SuppressedReasons: data.reasons }); break;
      case "request_production": await call("POST", "/v2/email/account/details", { MailType: data.mailType, WebsiteURL: data.website, UseCaseDescription: data.useCase, ContactLanguage: "EN", ProductionAccessEnabled: true }); break;
      case "send_test": {
        const r = await call("POST", "/v2/email/outbound-emails", { FromEmailAddress: data.from, Destination: { ToAddresses: data.to }, Content: { Simple: { Subject: { Data: data.subject }, Body: { Html: { Data: data.html } } } } });
        result = { messageId: r.MessageId }; break;
      }
    }
    await audit(db, context as Ctx, `ses_${data.action}`, "name" in data ? data.name : "email" in data ? data.email : data.id);
    return result as { ok?: boolean; messageId?: string };
  });

/** Publishes SES DKIM CNAMEs into the DNS provider linked to the domain in Domains & DNS. */
export const publishSesDkim = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), domain: z.string().trim().min(3).max(253) }))
  .handler(async ({ data, context }) => {
    const { data: ok } = await (context as Ctx).supabase.rpc("has_permission", { _module: "domains", _action: "edit" });
    if (!ok) throw new Error("Domains edit permission required");
    const db = await perm(context as Ctx, "edit");
    const r = await (await client(db, data.id))("GET", `/v2/email/identities/${encodeURIComponent(data.domain)}`);
    const tokens: string[] = r.DkimAttributes?.Tokens ?? [];
    if (!tokens.length) throw new Error("SES has no DKIM tokens for this domain yet");
    const { data: d } = await db.from("domains").select("name,account_id,zone_ref,nameservers").eq("name", data.domain.toLowerCase()).maybeSingle();
    if (!d?.account_id) throw new Error("Add this domain to Domains & DNS with a provider account first");
    const { data: acc } = await db.from("provider_accounts").select("provider,credentials_encrypted").eq("id", d.account_id).single();
    const { decryptCreds, dnsAdapter } = await import("./providers.server");
    const adapter = dnsAdapter(acc!.provider, await decryptCreds(acc!.credentials_encrypted));
    const zone = { name: d.name, ref: d.zone_ref ?? d.name, nameservers: d.nameservers };
    for (const t of tokens) await adapter.upsert(zone, { type: "CNAME", name: `${t}._domainkey`, content: `${t}.dkim.amazonses.com`, ttl: 3600 } as never);
    await audit(db, context as Ctx, "ses_publish_dkim", data.domain);
    return { published: tokens.length };
  });
