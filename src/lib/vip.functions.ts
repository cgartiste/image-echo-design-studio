import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string; claims: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export const POOL_STATUSES = ["available", "assigned", "maintenance", "suspended", "error", "pending"] as const;
export const VIP_STATUSES = ["active", "pending", "suspended", "maintenance", "archived"] as const;

async function perm(ctx: Ctx, action: string) {
  const { data } = await ctx.supabase.rpc("has_permission", { _module: "vip", _action: action });
  return !!data;
}
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
async function audit(db: any, ctx: Ctx, action: string, details: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  await db.from("activity_logs").insert({ user_id: ctx.userId, user_email: ctx.claims?.email ?? null, module: "vip", action, details: details.slice(0, 500) });
}

export const listSesPool = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await perm(context as Ctx, "view"))) throw new Error("No access to VIP accounts");
    const db = await admin();
    const { data } = await db.from("provider_accounts").select("id,name,status,last_error,last_sync_at,is_vip,pool_status,region,daily_quota").eq("provider", "aws_ses").order("created_at");
    return data ?? [];
  });

export const updatePoolAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(), is_vip: z.boolean(), pool_status: z.enum(POOL_STATUSES),
    region: z.string().trim().max(30).nullable(), daily_quota: z.number().int().min(0).max(100_000_000).nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await perm(context as Ctx, "assign"))) throw new Error("You don't have permission to change the VIP pool");
    const db = await admin();
    const { id, ...patch } = data;
    const { error } = await db.from("provider_accounts").update(patch).eq("id", id).eq("provider", "aws_ses");
    if (error) throw new Error(error.message);
    await audit(db, context as Ctx, "update_pool_account", `${id} · vip=${data.is_vip} · ${data.pool_status}`);
    return { ok: true };
  });

const clientSchema = z.object({
  id: z.string().uuid().optional(),
  company: z.string().trim().min(1).max(120),
  contact_name: z.string().trim().max(120).nullable(),
  contact_email: z.string().trim().toLowerCase().email().max(255).nullable().or(z.literal("").transform(() => null)),
  owner_id: z.string().uuid().nullable(),
  status: z.enum(VIP_STATUSES),
  allowed_domains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Invalid domain")).max(50),
  ses_account_id: z.string().uuid().nullable(),
  backup_account_id: z.string().uuid().nullable(),
  internal_quota: z.number().int().min(0).max(100_000_000).nullable(),
  notes: z.string().max(4000).nullable(),
});

export const saveVipClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => clientSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (!(await perm(ctx, data.id ? "edit" : "create"))) throw new Error("You don't have permission to edit VIP clients");
    const db = await admin();
    const { id, ...row } = data;
    const prev = id ? (await db.from("vip_clients").select("ses_account_id,backup_account_id").eq("id", id).single()).data : null;
    const assignmentChanged = !prev ? !!(row.ses_account_id || row.backup_account_id)
      : prev.ses_account_id !== row.ses_account_id || prev.backup_account_id !== row.backup_account_id;
    // Changing which SES account serves a client is a validated action.
    if (assignmentChanged && !(await perm(ctx, "assign"))) throw new Error("Only authorised staff can change SES account assignments");
    const res = id
      ? await db.from("vip_clients").update(row).eq("id", id).select("id").single()
      : await db.from("vip_clients").insert({ ...row, created_by: ctx.userId }).select("id").single();
    if (res.error) throw new Error(res.error.message);
    if (assignmentChanged) {
      if (prev?.ses_account_id && prev.ses_account_id !== row.ses_account_id) await db.from("provider_accounts").update({ pool_status: "available" }).eq("id", prev.ses_account_id);
      if (row.ses_account_id) await db.from("provider_accounts").update({ pool_status: "assigned" }).eq("id", row.ses_account_id);
      await audit(db, ctx, "assign_ses", `${row.company} · primary=${row.ses_account_id ?? "none"} · backup=${row.backup_account_id ?? "none"}`);
    }
    await audit(db, ctx, id ? "update_vip_client" : "create_vip_client", row.company);
    return { id: res.data.id as string };
  });

export const deleteVipClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await perm(context as Ctx, "delete"))) throw new Error("You don't have permission to delete VIP clients");
    const db = await admin();
    const { data: c } = await db.from("vip_clients").select("company,ses_account_id").eq("id", data.id).single();
    if (!c) throw new Error("Client not found");
    await db.from("vip_clients").delete().eq("id", data.id);
    if (c.ses_account_id) await db.from("provider_accounts").update({ pool_status: "available" }).eq("id", c.ses_account_id);
    await audit(db, context as Ctx, "delete_vip_client", c.company);
    return { ok: true };
  });

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await perm(context as Ctx, "view"))) return [];
    const db = await admin();
    const { data } = await db.from("profiles").select("id,full_name,email").eq("suspended", false).order("full_name");
    return data ?? [];
  });
