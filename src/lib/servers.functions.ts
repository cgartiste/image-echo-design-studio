import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { COMMANDS, parseConfig } from "./kumo-config";

type Ctx = { supabase: any; userId: string; claims: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function perm(ctx: Ctx, action: string) {
  const { data } = await ctx.supabase.rpc("has_permission", { _module: "servers", _action: action });
  if (!data) throw new Error("You don't have permission for this action");
}
async function audit(ctx: Ctx, action: string, details: string) {
  await ctx.supabase.from("activity_logs").insert({ user_id: ctx.userId, user_email: ctx.claims?.email ?? null, module: "servers", action, details: details.slice(0, 500) });
}
const origin = () => new URL(getRequest().url).origin;
const installLine = (site: string, token: string) => `curl -fsSL '${site}/api/public/agent/install?t=${token}' | sudo bash`;

export const addServers = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    servers: z.array(z.object({ name: z.string().trim().min(1).max(80), ip: z.string().trim().min(3).max(64), pool: z.string().trim().min(1).max(60), hostname: z.string().trim().max(253).optional() })).min(1).max(200),
    install: z.boolean(),
  }))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx; await perm(ctx, "create");
    const { randomToken, sha256 } = await import("./agent.server");
    const { encryptCreds } = await import("./providers.server");
    const site = origin(); const out: { id: string; name: string; ip: string; command: string }[] = [];
    for (const s of data.servers) {
      const token = randomToken();
      const { data: row, error } = await ctx.supabase.from("mta_servers").insert({
        name: s.name, ip: s.ip, pool: s.pool, hostname: s.hostname || null, agent_token_hash: await sha256(token),
        agent_token_enc: await encryptCreds({ token }), created_by: ctx.userId,
      }).select("id").single();
      if (error) throw new Error(`${s.ip}: ${error.message}`);
      if (data.install) await ctx.supabase.from("server_commands").insert({ server_id: row.id, kind: "install_kumomta", created_by: ctx.userId });
      out.push({ id: row.id, name: s.name, ip: s.ip, command: installLine(site, token) });
    }
    await audit(ctx, "add_servers", `${data.servers.length} server(s): ${data.servers.map((s) => s.ip).join(", ")}`);
    return out;
  });

export const getInstallCommand = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx; await perm(ctx, "edit");
    const { data: rows, error } = await ctx.supabase.from("mta_servers").select("id,name,ip,agent_token_enc").in("id", data.ids);
    if (error) throw new Error(error.message);
    const { decryptCreds } = await import("./providers.server");
    const site = origin();
    return Promise.all((rows ?? []).map(async (r: { id: string; name: string; ip: string; agent_token_enc: string }) =>
      ({ id: r.id, name: r.name, ip: r.ip, command: installLine(site, (await decryptCreds(r.agent_token_enc))["token"]!) })));
  });

export const rotateToken = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx; await perm(ctx, "edit");
    const { randomToken, sha256 } = await import("./agent.server");
    const { encryptCreds } = await import("./providers.server");
    const token = randomToken();
    const { error } = await ctx.supabase.from("mta_servers").update({ agent_token_hash: await sha256(token), agent_token_enc: await encryptCreds({ token }), status: "pending" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(ctx, "rotate_token", data.id);
    return { command: installLine(origin(), token) };
  });

export const queueCommands = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    ids: z.array(z.string().uuid()).min(1).max(200),
    kind: z.enum(Object.keys(COMMANDS) as [keyof typeof COMMANDS, ...(keyof typeof COMMANDS)[]]),
    payload: z.record(z.union([z.string().max(10000), z.number()])).default({}),
  }))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx; await perm(ctx, "execute");
    if (data.kind === "shell" && !String(data.payload["command"] ?? "").trim()) throw new Error("Enter a command");
    const rows = data.ids.map((server_id) => ({ server_id, kind: data.kind, payload: data.payload, created_by: ctx.userId }));
    const { error } = await ctx.supabase.from("server_commands").insert(rows);
    if (error) throw new Error(error.message.includes("row-level") ? "Not allowed (shell commands require Super Admin)" : error.message);
    await audit(ctx, `command_${data.kind}`, `${data.ids.length} server(s)${data.kind === "shell" ? `: ${String(data.payload["command"]).slice(0, 200)}` : ""}`);
    return { queued: rows.length };
  });

export const updateServer = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(), name: z.string().trim().min(1).max(80), pool: z.string().trim().min(1).max(60), hostname: z.string().trim().max(253),
    paused: z.boolean(), ses_account_id: z.string().uuid().nullable(), config: z.record(z.unknown()),
  }))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx; await perm(ctx, "edit");
    const { error } = await ctx.supabase.from("mta_servers").update({
      name: data.name, pool: data.pool, hostname: data.hostname || null, paused: data.paused, ses_account_id: data.ses_account_id, config: parseConfig(data.config),
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(ctx, "update_server", `${data.name} (${data.pool})`);
    return { ok: true };
  });
