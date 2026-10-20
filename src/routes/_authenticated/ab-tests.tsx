import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, StatusBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMe } from "@/lib/auth";
import { pickWinner, rate, type Metric, type VariantStats } from "@/lib/ab-stats";
import { fmtDate } from "@/lib/format";

const meta = "Compare campaign variants and pick a statistically sound winner.";
export const Route = createFileRoute("/_authenticated/ab-tests")({
  head: () => ({ meta: [{ title: "A/B tests — Cortex" }, { name: "description", content: meta }, { property: "og:title", content: "A/B tests — Cortex" }, { property: "og:description", content: meta }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: AbPage,
});

type Ab = { enabled?: boolean; test_on?: string; winner_metric?: string; test_percent?: number; wait_hours?: number; variants?: { name: string; subject: string; from_name: string }[] };

function AbPage() {
  const { data = [] } = useQuery({
    queryKey: ["ab-campaigns"],
    queryFn: async () => (await supabase.from("campaigns").select("id,name,status,subject,from_name,settings,started_at,created_at").filter("settings->ab->>enabled", "eq", "true").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: results = [] } = useQuery({ queryKey: ["ab-results"], queryFn: async () => (await supabase.from("ab_results").select("*")).data ?? [] });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <PageHeader title="A/B tests" subtitle="Every campaign with variants enabled. Turn on A/B testing in the campaign editor (Variants step)." />
      <div className="space-y-3">
        {data.map((c) => {
          const ab = ((c.settings as Record<string, unknown>)?.["ab"] ?? {}) as Ab;
          const res = results.find((r) => r.campaign_id === c.id);
          return (
            <Panel key={c.id}>
              <button className="flex w-full flex-wrap items-center gap-3 p-4 text-left" onClick={() => setOpen(open === c.id ? null : c.id)}>
                <div className="min-w-0 flex-1"><div className="font-medium">{c.name}</div><div className="text-xs text-muted-foreground">Testing {ab.test_on ?? "subject"} · {(ab.variants?.length ?? 0) + 1} variants · winner by {ab.winner_metric ?? "open"} rate · {fmtDate(c.created_at)}</div></div>
                {res && <Badge variant="outline"><Trophy className="mr-1 h-3 w-3" />Winner {res.winner}</Badge>}
                <StatusBadge status={c.status} />
              </button>
              {open === c.id && <Detail id={c.id} ab={ab} base={{ subject: c.subject, from_name: c.from_name ?? "" }} result={res ?? null} />}
            </Panel>
          );
        })}
        {!data.length && <Panel className="p-8 text-center text-sm text-muted-foreground">No A/B tests yet. Open a campaign, go to the Variants step and enable A/B testing. <Link to="/campaigns" className="text-primary">Go to campaigns</Link></Panel>}
      </div>
    </div>
  );
}

function Detail({ id, ab, base, result }: { id: string; ab: Ab; base: { subject: string; from_name: string }; result: { winner: string; confidence: number | null; decided_at: string } | null }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const metric: Metric = ab.winner_metric === "click" ? "click" : "open";
  const { data: raw = [] } = useQuery({ queryKey: ["ab-stats", id], queryFn: async () => (await supabase.rpc("ab_variant_stats", { cid: id })).data ?? [] });
  const names = ["A", ...(ab.variants ?? []).map((_, i) => String.fromCharCode(66 + i))];
  const stats: VariantStats[] = names.map((n) => { const r = raw.find((x) => x.variant === n); return { variant: n, sent: Number(r?.sent ?? 0), opened: Number(r?.opened ?? 0), clicked: Number(r?.clicked ?? 0) }; });
  const w = pickWinner(stats, metric);
  const label = (n: string) => { if (n === "A") return base; const v = ab.variants?.[n.charCodeAt(0) - 66]; return { subject: v?.subject || base.subject, from_name: v?.from_name || base.from_name }; };
  const decide = useMutation({
    mutationFn: async (winner: string) => {
      const { error } = await supabase.from("ab_results").upsert({ campaign_id: id, winner, metric, confidence: Number(w.confidence.toFixed(4)), auto: false, decided_by: me!.user.id, decided_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Winner saved"); qc.invalidateQueries({ queryKey: ["ab-results"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const total = stats.reduce((s, v) => s + v.sent, 0);
  return (
    <div className="border-t p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => {
          const l = label(s.variant);
          const lead = w.leader === s.variant && total > 0;
          return (
            <div key={s.variant} className={`rounded-md border p-3 ${lead ? "border-primary" : ""}`}>
              <div className="flex items-center justify-between"><span className="font-semibold">Variant {s.variant}</span>{result?.winner === s.variant && <Trophy className="h-4 w-4 text-primary" />}</div>
              <p className="mt-1 truncate text-xs text-muted-foreground" title={l.subject}>{l.subject}</p>
              <p className="truncate text-xs text-muted-foreground">{l.from_name}</p>
              <div className="mt-3 grid grid-cols-3 gap-1 text-center text-xs">
                <div><div className="font-mono text-base">{s.sent}</div>sent</div>
                <div><div className="font-mono text-base">{(rate(s, "open") * 100).toFixed(1)}%</div>opens</div>
                <div><div className="font-mono text-base">{(rate(s, "click") * 100).toFixed(1)}%</div>clicks</div>
              </div>
              {me?.can("campaigns", "edit") && <Button size="sm" variant={lead ? "default" : "outline"} className="mt-3 w-full" disabled={decide.isPending} onClick={() => decide.mutate(s.variant)}>Choose as winner</Button>}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-sm">
        {total === 0 ? "No messages sent yet — results appear once the test portion is delivered."
          : w.decisive ? `Variant ${w.leader} wins on ${metric} rate with ${(w.confidence * 100).toFixed(1)}% confidence.`
          : `Variant ${w.leader} leads (${(w.confidence * 100).toFixed(0)}% confidence) — not conclusive yet (needs 95% and 100+ sends per variant).`}
      </p>
      {result && <p className="text-xs text-muted-foreground">Winner {result.winner} saved {fmtDate(result.decided_at)}.</p>}
    </div>
  );
}
