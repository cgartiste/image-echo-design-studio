import { createFileRoute } from "@tanstack/react-router";

// Agent source is public (contains no secrets; the token lives only on the VPS).
export const Route = createFileRoute("/api/public/agent/script.py")({
  server: {
    handlers: {
      GET: async () => {
        const { AGENT_PY } = await import("@/lib/agent-script.server");
        return new Response(AGENT_PY, { headers: { "Content-Type": "text/x-python", "Cache-Control": "no-store" } });
      },
    },
  },
});
