import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { download, toCsv } from "@/lib/csv";
import { reportTotals } from "@/lib/report";

const meta = "Management report: volume, engagement, revenue, profit, deliverability and incidents for a period.";
export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Management reports — Cortex" }, { name: "description", content: meta }, { property: "og:title", content: "Management reports — Cortex" }, { property: "og:description", content: meta }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const [days, setDays] = useState("30");
  const since = new Date(Date.now() - Number(days) * 86400_000).toISOString();
  const { data } = useQuery({
    queryKey: ["mgmt-report", days],
    queryFn: async () => {
      const [c, i, p] = await Promise.all([
        supabase.from("campaigns").select("id,name,status,started_at,created_at,sent,delivered,opens,clicks,bounces,complaints,conversions,revenue,cost").gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
        supabase.from("incidents").select("severity,status,created_at,resolved_at").gte("created_at", since),
        supabase.from("placement_reports").select("seeds_checked,inbox,spam").gte("created_at", since),
      ]);
      return { campaigns: c.data ?? [], incidents: i.data ?? [], placement: p.data ?? [] };
    },
  });
  const rows = data?.campaigns ?? [];
  const t = reportTotals(rows);
  const seeds = (data?.placement ?? []).reduce((a, r) => ({ s: a.s + r.seeds_checked, i: a.i + r.inbox, sp: a.sp + r.spam }), { s: 0, i: 0, sp: 0 });
  const inc = data?.incidents ?? [];
  const top = [...rows].sort((a, b) => (b.revenue - b.cost) - (a.revenue - a.cost)).slice(0, 10);
  const kpis: [string, string][] = [
    ["Campaigns", fmtNum(t.campaigns)], ["Sent", fmtNum(t.sent)], ["Delivered", fmtNum(t.delivered)], ["Open rate", `${t.openRate}%`],
    ["Click rate", `${t.clickRate}%`], ["Bounce rate", `${t.bounceRate}%`], ["Complaint rate", `${t.complaintRate}%`], ["Conversions", fmtNum(t.conversions)],
    ["Revenue", fmtMoney(t.revenue)], ["Cost", fmtMoney(t.cost)], ["Profit", fmtMoney(t.profit)], ["ROI", t.roi === null ? "—" : `${t.roi}%`],
    ["Inbox placement", seeds.s ? `${Math.round((seeds.i / seeds.s) * 100)}%` : "—"], ["Spam placement", seeds.s ? `${Math.round((seeds.sp / seeds.s) * 100)}%` : "—"],
    ["Incidents", `${inc.length} (${inc.filter((x) => x.severity === "critical").length} critical)`], ["Open incidents", fmtNum(inc.filter((x) => x.status !== "resolved").length)],
  ];
  const exportCsv = () => download(`cortex-report-${days}d.csv`, toCsv(rows.map((r) => ({ ...r, profit: r.revenue - r.cost })), ["name", "status", "created_at", "sent", "delivered", "opens", "clicks", "bounces", "complaints", "conversions", "revenue", "cost", "profit"]));

  return (
    <div className="space-y-4">
      <PageHeader title="Management report" subtitle={`From ${fmtDate(since)} to today`}
        actions={<div className="flex gap-2 print:hidden">
          <Select value={days} onValueChange={setDays}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{["7", "30", "90", "365"].map((d) => <SelectItem key={d} value={d}>Last {d} days</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" onClick={exportCsv}><Download className="mr-1 h-4 w-4" />CSV</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Print / PDF</Button>
        </div>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map(([l, v]) => <Panel key={l}><div className="p-4"><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 text-xl font-semibold tabular-nums">{v}</div></div></Panel>)}
      </div>
      <Panel title="Top campaigns by profit">
        {top.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No campaigns in this period.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="p-3">Campaign</th><th className="p-3 text-right">Sent</th><th className="p-3 text-right">Opens</th><th className="p-3 text-right">Clicks</th><th className="p-3 text-right">Revenue</th><th className="p-3 text-right">Profit</th></tr></thead>
            <tbody>{top.map((r) => <tr key={r.id} className="border-t"><td className="p-3">{r.name}</td><td className="p-3 text-right tabular-nums">{fmtNum(r.sent)}</td><td className="p-3 text-right tabular-nums">{fmtNum(r.opens)}</td><td className="p-3 text-right tabular-nums">{fmtNum(r.clicks)}</td><td className="p-3 text-right tabular-nums">{fmtMoney(r.revenue)}</td><td className="p-3 text-right tabular-nums">{fmtMoney(r.revenue - r.cost)}</td></tr>)}</tbody>
          </table></div>
        )}
      </Panel>
    </div>
  );
}
