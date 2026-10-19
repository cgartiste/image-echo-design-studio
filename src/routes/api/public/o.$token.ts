import { createFileRoute } from "@tanstack/react-router";

const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));

// Open-tracking pixel. Always returns the GIF, even for invalid tokens.
export const Route = createFileRoute("/api/public/o/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try { const { recordOpen } = await import("@/lib/tracking.server"); await recordOpen(params.token.replace(/\.gif$/, ""), request); } catch (e) { console.error(e); }
        return new Response(GIF, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, private" } });
      },
    },
  },
});
