import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const INSTRUCTIONS = `You are a senior email deliverability and campaign analyst for Cortex, an internal email-marketing tool that sends through Amazon SES.
Analyse the JSON data you receive. Answer in the language requested. Use Markdown with these sections:
## Summary (3 bullets), ## What's working, ## Risks (deliverability, bounces, complaints, spam placement), ## Recommendations (numbered, concrete, prioritised).
Only use the numbers provided; say when data is missing. Never suggest spam-filter evasion, fake engagement or deceptive practices.`;

export const analyzePerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(1).max(180), language: z.enum(["fr", "en"]), campaignId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: ok } = await sb.rpc("has_permission", { _module: "campaigns", _action: "view" });
    if (!ok) throw new Error("You don't have permission for this action");
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    let cq = sb.from("campaigns").select("name,status,subject,from_email,recipient_count,sent,delivered,opens,clicks,bounces,complaints,conversions,revenue,cost,started_at").order("created_at", { ascending: false }).limit(60);
    cq = data.campaignId ? cq.eq("id", data.campaignId) : cq.gte("created_at", since);
    const [campaigns, placement, alerts] = await Promise.all([
      cq,
      sb.from("placement_reports").select("subject,sender,seeds_checked,inbox,promotions,spam,missing,created_at").gte("created_at", since).limit(50),
      sb.from("alerts").select("*").gte("created_at", since).limit(30),
    ]);
    const payload = { period_days: data.days, campaigns: campaigns.data ?? [], placement_reports: placement.data ?? [], alerts: alerts.data ?? [] };
    if (!payload.campaigns.length && !payload.placement_reports.length) return { text: data.language === "fr" ? "Pas encore de données sur cette période." : "No data yet for this period.", at: new Date().toISOString() };
    const { askAI } = await import("./ai.server");
    const text = await askAI(INSTRUCTIONS, `Language: ${data.language === "fr" ? "French" : "English"}\nData:\n${JSON.stringify(payload).slice(0, 60000)}`);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("activity_logs").insert({ user_id: context.userId, user_email: (context.claims as { email?: string })?.email ?? null, module: "insights", action: "ai_analysis", details: `${data.days}d${data.campaignId ? " · campaign" : ""}` });
    return { text, at: new Date().toISOString() };
  });
