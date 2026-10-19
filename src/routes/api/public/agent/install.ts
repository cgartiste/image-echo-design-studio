import { createFileRoute } from "@tanstack/react-router";

// GET /api/public/agent/install?t=<token> → bash installer for one server (token verified).
export const Route = createFileRoute("/api/public/agent/install")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { agentFromRequest } = await import("@/lib/agent.server");
        const a = await agentFromRequest(request);
        if (!a) return new Response("echo 'Invalid or revoked Cortex token'; exit 1\n", { status: 401, headers: { "Content-Type": "text/x-shellscript" } });
        const { installerScript } = await import("@/lib/agent-script.server");
        return new Response(installerScript(new URL(request.url).origin, a.token), { headers: { "Content-Type": "text/x-shellscript", "Cache-Control": "no-store" } });
      },
    },
  },
});
