import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string; claims: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const ROLES = ["admin", "manager", "operator", "analyst", "viewer"] as const;

async function requireManager(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_permission", { _module: "users", _action: "manage_users" });
  if (!data) throw new Error("You don't have permission to manage the team");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
async function audit(admin: any, ctx: Ctx, action: string, details: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  await admin.from("activity_logs").insert({ user_id: ctx.userId, user_email: ctx.claims?.email ?? null, module: "users", action, details: details.slice(0, 500) });
}

export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requireManager(context as Ctx);
    const { data: list, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error(error.message);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      admin.from("profiles").select("id,full_name,department,suspended"),
      admin.from("user_roles").select("user_id,role"),
    ]);
    return list.users.map((u) => {
      const p = (profiles ?? []).find((x) => x.id === u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        name: p?.full_name ?? "",
        department: p?.department ?? "",
        suspended: !!p?.suspended,
        roles: (roles ?? []).filter((r) => r.user_id === u.id).map((r) => r.role as string),
        lastSignIn: u.last_sign_in_at ?? null,
        invitedAt: u.invited_at ?? null,
        confirmed: !!u.email_confirmed_at,
        mfa: (u.factors ?? []).some((f) => f.status === "verified"),
        createdAt: u.created_at,
      };
    });
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().toLowerCase().email().max(255), name: z.string().trim().max(100), department: z.string().trim().max(60), role: z.enum(ROLES) }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireManager(context as Ctx);
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const url = new URL(req.url);
    const host = url.hostname === "localhost" ? req.headers.get("x-forwarded-host") : null;
    const origin = host ? `https://${host}` : url.origin;
    const { data: res, error } = await admin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.name, invited_role: data.role },
      redirectTo: `${origin}/reset-password`,
    });
    if (error) throw new Error(error.message);
    if (res.user) await admin.from("profiles").update({ department: data.department || null }).eq("id", res.user.id);
    await audit(admin, context as Ctx, "invite_user", `${data.email} · ${data.role}`);
    return { ok: true };
  });

export const updateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid(), role: z.enum(ROLES).optional(), department: z.string().trim().max(60).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireManager(context as Ctx);
    if (data.userId === context.userId && data.role) throw new Error("You cannot change your own role");
    const { data: target } = await admin.from("user_roles").select("role").eq("user_id", data.userId);
    if ((target ?? []).some((r) => r.role === "super_admin")) throw new Error("The main administrator cannot be modified here");
    if (data.role) {
      await admin.from("user_roles").delete().eq("user_id", data.userId);
      const { error } = await admin.from("user_roles").insert({ user_id: data.userId, role: data.role });
      if (error) throw new Error(error.message);
    }
    if (data.department !== undefined) await admin.from("profiles").update({ department: data.department || null }).eq("id", data.userId);
    await audit(admin, context as Ctx, "update_user", `${data.userId}${data.role ? ` → ${data.role}` : ""}`);
    return { ok: true };
  });

// Suspension bans the account (blocks sign-in and token refresh) and removes its roles' effect via the profile flag.
export const setMemberSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid(), suspended: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await requireManager(context as Ctx);
    if (data.userId === context.userId) throw new Error("You cannot suspend yourself");
    const { data: target } = await admin.from("user_roles").select("role").eq("user_id", data.userId);
    if ((target ?? []).some((r) => r.role === "super_admin")) throw new Error("The main administrator cannot be suspended");
    const { error } = await admin.auth.admin.updateUserById(data.userId, { ban_duration: data.suspended ? "876000h" : "none" });
    if (error) throw new Error(error.message);
    await admin.from("profiles").update({ suspended: data.suspended }).eq("id", data.userId);
    if (!data.suspended && !(target ?? []).length) await admin.from("user_roles").insert({ user_id: data.userId, role: "viewer" });
    await audit(admin, context as Ctx, data.suspended ? "suspend_user" : "reactivate_user", data.userId);
    return { ok: true };
  });
