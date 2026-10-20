import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { analyzePerformance } from "@/lib/insights.functions";
import { fmtDate } from "@/lib/format";

const meta = "AI-powered analysis of campaign results, inbox placement and alerts, with prioritised recommendations.";
export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({ meta: [{ title: "AI insights — Cortex" }, { name: "description", content: meta }, { property: "og:title", content: "AI insights — Cortex" }, { property: "og:description", content: meta }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: InsightsPage,
});

function InsightsPage() {
  const run = useServerFn(analyzePerformance);
  const [days, setDays] = useState("30");
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [campaign, setCampaign] = useState("all");
  const { data: campaigns = [] } = useQuery({ queryKey: ["insight-campaigns"], queryFn: async () => (await supabase.from("campaigns").select("id,name").order("created_at", { ascending: false }).limit(200)).data ?? [] });
  const m = useMutation({ mutationFn: () => run({ data: { days: Number(days), language: lang, campaignId: campaign === "all" ? null : campaign } }) });

  return (
    <div className="space-y-4">
      <PageHeader title="AI insights" subtitle="Lovable AI reads your campaign results, placement reports and alerts, then suggests what to fix first." />
      <Panel>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <Select value={campaign} onValueChange={setCampaign}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All campaigns</SelectItem>{campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
          <Select value={days} onValueChange={setDays}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{["7", "30", "90", "180"].map((d) => <SelectItem key={d} value={d}>Last {d} days</SelectItem>)}</SelectContent></Select>
          <Select value={lang} onValueChange={(v) => setLang(v as "fr" | "en")}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="fr">Français</SelectItem><SelectItem value="en">English</SelectItem></SelectContent></Select>
          <Button disabled={m.isPending} onClick={() => m.mutate()}><Sparkles className="mr-1 h-4 w-4" />{m.isPending ? "Analysing…" : "Analyse"}</Button>
        </div>
      </Panel>
      {m.error && <Panel><p className="p-4 text-sm text-destructive">{m.error instanceof Error ? m.error.message : "Analysis failed"}</p></Panel>}
      {m.data && (
        <Panel title={`Analysis · ${fmtDate(m.data.at)}`}>
          <div className="prose prose-sm max-w-none p-4 dark:prose-invert [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown>{m.data.text}</ReactMarkdown>
          </div>
        </Panel>
      )}
    </div>
  );
}
