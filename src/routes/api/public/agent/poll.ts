import { createFileRoute } from "@tanstack/react-router";

// Agent heartbeat: stores system/port info, hands out queued commands, says whether there is mail to send.
export const Route = createFileRoute("/api/public/agent/poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { agentFromRequest, json } = await import("@/lib/agent.server");
        const a = await agentFromRequest(request);
        if (!a) return json({ error: "unauthorized" }, 401);
        const body = (await request.json().catch(() => ({}))) as { info?: Record<string, unknown>; ports?: Record<string, unknown> };
        const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString(), status: "online" };
        if (body.info && typeof body.info === "object") {
          patch["system"] = body.info;
          patch["kumo_installed"] = !!body.info["kumo_installed"];
          patch["kumo_active"] = !!body.info["kumo_active"];
          patch["kumo_version"] = String(body.info["kumo_version"] ?? "").slice(0, 80) || null;
        }
        if (body.ports && typeof body.ports === "object") patch["ports"] = body.ports;
        await a.db.from("mta_servers").update(patch).eq("id", a.server.id);

        const { data: cmds } = await a.db.from("server_commands").select("id,kind,payload").eq("server_id", a.server.id).eq("status", "queued").order("created_at").limit(5);
        if (cmds?.length) await a.db.from("server_commands").update({ status: "sent", started_at: new Date().toISOString() }).in("id", cmds.map((c) => c.id));

        let send = false;
        if (!a.server.paused) {
          const { count } = await a.db.from("send_jobs").select("id,campaigns!inner(status,server_pool)", { count: "exact", head: true })
            .eq("status", "queued").or("is_test.eq.true,status.eq.running", { referencedTable: "campaigns" });
          send = (count ?? 0) > 0;
        }
        return json({ commands: cmds ?? [], send });
      },
    },
  },
});
