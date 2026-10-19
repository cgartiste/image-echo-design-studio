import { createFileRoute } from "@tanstack/react-router";

// Unsubscribe page (GET shows a confirm button; POST unsubscribes, also used by one-click List-Unsubscribe).
export const Route = createFileRoute("/api/public/u/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { loadJob, htmlPage } = await import("@/lib/tracking.server");
        const t = await loadJob(params.token).catch(() => null);
        if (!t) return htmlPage(404, "<p>This unsubscribe link is not valid.</p>");
        const masked = t.job.email.replace(/^(.).*(@.*)$/, "$1***$2");
        return htmlPage(200, `<h2>Unsubscribe</h2><p>Stop receiving these emails at <b>${masked}</b>?</p><form method="post"><button style="padding:10px 20px;font-size:16px;cursor:pointer">Unsubscribe</button></form>`);
      },
      POST: async ({ params, request }) => {
        const { unsubscribe, htmlPage } = await import("@/lib/tracking.server");
        const ok = await unsubscribe(params.token, request).catch(() => false);
        return ok ? htmlPage(200, "<h2>You are unsubscribed</h2><p>You will no longer receive these emails.</p>") : htmlPage(404, "<p>This unsubscribe link is not valid.</p>");
      },
    },
  },
});
