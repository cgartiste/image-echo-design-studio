import { createFileRoute } from "@tanstack/react-router";

// Click tracking: the destination is inside the signed token, so this cannot be used as an open redirect.
export const Route = createFileRoute("/api/public/c/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { recordClick, htmlPage } = await import("@/lib/tracking.server");
        const url = await recordClick(params.token, request).catch(() => null);
        if (!url) return htmlPage(404, "<p>This link is not valid.</p>");
        return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
      },
    },
  },
});
