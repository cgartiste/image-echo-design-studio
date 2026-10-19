import { createFileRoute } from "@tanstack/react-router";

// Web version of a sent message, re-rendered for the recipient.
export const Route = createFileRoute("/api/public/w/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { loadJob, htmlPage } = await import("@/lib/tracking.server");
        const t = await loadJob(params.token).catch(() => null);
        if (!t) return htmlPage(404, "<p>This message is no longer available.</p>");
        const { data: c } = await t.db.from("campaigns").select("*,email_lists(name)").eq("id", t.job.campaign_id).maybeSingle();
        if (!c) return htmlPage(404, "<p>This message is no longer available.</p>");
        const { data: sub } = t.job.subscriber_id ? await t.db.from("subscribers").select("first_name,last_name,country,city").eq("id", t.job.subscriber_id).maybeSingle() : { data: null };
        const { renderJob } = await import("@/lib/agent.server");
        const m = await renderJob({ job: t.job, campaign: { ...c, track_opens: false }, sub, listName: (c.email_lists as { name?: string } | null)?.name ?? "", origin: new URL(request.url).origin });
        return new Response(m.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Content-Security-Policy": "script-src 'none'" } });
      },
    },
  },
});
