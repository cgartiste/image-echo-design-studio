import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/agent/result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { agentFromRequest, json } = await import("@/lib/agent.server");
        const a = await agentFromRequest(request);
        if (!a) return json({ error: "unauthorized" }, 401);
        const b = (await request.json().catch(() => ({}))) as { command_id?: string; status?: string; output?: string };
        if (!b.command_id || !["running", "done", "failed"].includes(b.status ?? "")) return json({ error: "bad request" }, 400);
        const patch: Record<string, unknown> = { status: b.status };
        if (b.status !== "running") { patch["finished_at"] = new Date().toISOString(); patch["output"] = String(b.output ?? "").slice(-20000); }
        await a.db.from("server_commands").update(patch).eq("id", b.command_id).eq("server_id", a.server.id);
        if (b.status === "failed") await a.db.from("mta_servers").update({ last_error: String(b.output ?? "").slice(-300) }).eq("id", a.server.id);
        return json({ ok: true });
      },
    },
  },
});
