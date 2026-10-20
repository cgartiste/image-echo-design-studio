import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDate } from "@/lib/format";

const meta = "History of inbox placement checks across Gmail test inboxes, with trends per sender and subject.";
export const Route = createFileRoute("/_authenticated/placement")({
  head: () => ({ meta: [{ title: "Placement reports — Cortex" }, { name: "description", content: meta }, { property: "og:title", content: "Placement reports — Cortex" }, { property: "og:description", content: meta }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: PlacementPage,
});

type Report = { id: string; query: string; subject: string | null; sender: string | null; seeds_checked: number; found: number; inbox: number; promotions: number; spam: number; other: number; missing: number; details: { email: string | null; placement: string | null; error: string | null }[]; created_at: string };
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function Bar({ r }: { r: Report }) {
  const d = r.seeds_checked || 1;
  const seg = [
    { v: r.inbox, c: "bg-success", l: "Inbox" },
    { v: r.promotions, c: "bg-warning", l: "Promotions" },
    { v: r.other, c: "bg-info", l: "Other tabs" },
    { v: r.spam, c: "bg-destructive", l: "Spam" },
    { v: r.missing, c: "bg-muted-foreground/40", l: "Not found" },
  ];
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
      {seg.map((s) => s.v > 0 && <div key={s.l} title={`${s.l}: ${s.v}`} className={s.c} style={{ width: `${(s.v / d) * 100}%` }} />)}
    </div>
  );
}

function PlacementPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["placement-reports"],
    queryFn: async () => ((await supabase.from("placement_reports").select("*").order("created_at", { ascending: false }).limit(500)).data ?? []) as unknown as Report[],
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("placement_reports").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["placement-reports"] }); toast.success("Report deleted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const shown = reports.filter((r) => !filter || `${r.subject ?? ""} ${r.sender ?? ""}`.toLowerCase().includes(filter.toLowerCase()));
  const totals = useMemo(() => shown.reduce((a, r) => ({ seeds: a.seeds + r.seeds_checked, inbox: a.inbox + r.inbox, promo: a.promo + r.promotions, spam: a.spam + r.spam, missing: a.missing + r.missing }), { seeds: 0, inbox: 0, promo: 0, spam: 0, missing: 0 }), [shown]);
  const bySender = useMemo(() => {
    const m = new Map<string, { seeds: number; inbox: number; spam: number; n: number }>();
    for (const r of shown) {
      const k = r.sender || "(any sender)";
      const v = m.get(k) ?? { seeds: 0, inbox: 0, spam: 0, n: 0 };
      v.seeds += r.seeds_checked; v.inbox += r.inbox; v.spam += r.spam; v.n++;
      m.set(k, v);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10);
  }, [shown]);

  return (
    <div className="space-y-6">
      <PageHeader title="Placement reports" subtitle="Every check run from Seed inboxes is saved here so you can follow inbox placement over time." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Checks", String(shown.length)],
          ["Inbox rate", `${pct(totals.inbox, totals.seeds)}%`],
          ["Spam rate", `${pct(totals.spam, totals.seeds)}%`],
          ["Not found", `${pct(totals.missing, totals.seeds)}%`],
        ].map(([l, v]) => (
          <Panel key={l} title={l}><div className="text-2xl font-semibold tabular-nums">{v}</div></Panel>
        ))}
      </div>

      <Panel title="By sender">
        {bySender.length === 0 ? <p className="text-sm text-muted-foreground">No data yet.</p> : (
          <div className="space-y-2">
            {bySender.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 text-sm">
                <span className="truncate font-mono text-xs">{k}</span>
                <span className="text-muted-foreground">{v.n} checks</span>
                <span className="text-success">{pct(v.inbox, v.seeds)}% inbox</span>
                <span className="text-destructive">{pct(v.spam, v.seeds)}% spam</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="History">
        <Input placeholder="Filter by subject or sender…" value={filter} onChange={(e) => setFilter(e.target.value)} className="mb-4 max-w-sm" />
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reports yet. Run a placement check from <Link to="/seeds" className="underline">Seed inboxes</Link>.</p>
        ) : (
          <div className="divide-y">
            {shown.map((r) => (
              <div key={r.id} className="py-3">
                <div className="flex items-center gap-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <div className="truncate text-sm font-medium">{r.subject || "(no subject filter)"}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.sender || "any sender"} · {fmtDate(r.created_at)} · {r.found}/{r.seeds_checked} found · {pct(r.inbox, r.seeds_checked)}% inbox</div>
                    <div className="mt-2"><Bar r={r} /></div>
                  </button>
                  <Button size="icon" variant="ghost" aria-label="Delete report" onClick={() => del.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
                {open === r.id && (
                  <div className="mt-3 grid gap-1 rounded-md bg-muted/50 p-3 text-xs">
                    {r.details.map((d, i) => (
                      <div key={i} className="flex justify-between gap-3">
                        <span className="truncate font-mono">{d.email ?? "unknown inbox"}</span>
                        <span className={d.placement === "inbox" ? "text-success" : d.placement === "spam" ? "text-destructive" : "text-muted-foreground"}>{d.error ? `Error: ${d.error}` : d.placement ?? "not found"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
