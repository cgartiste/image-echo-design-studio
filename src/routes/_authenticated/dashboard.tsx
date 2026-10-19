import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, StatusBadge } from "@/components/page";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fmtCompact, fmtDate, fmtMoney, fmtNum, fmtPct, pct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Cortex" }, { name: "description", content: "Campaign and deliverability overview." }, { property: "og:title", content: "Dashboard — Cortex" }, { property: "og:description", content: "Campaign and deliverability overview." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Dashboard,
});

type Period = "1" | "7" | "30" | "90" | "365" | "custom";

function Dashboard() {
  const [period, setPeriod] = useState<Period>("30");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);

  const range = useMemo(() => {
    if (period === "custom") return { from, to };
    const d = new Date(Date.now() - (Number(period) - 1) * 864e5).toISOString().slice(0, 10);
    return { from: d, to: today };
  }, [period, from, to, today]);

  const stats = useQuery({
    queryKey: ["daily_stats", range],
    queryFn: async () =>
      (await supabase.from("daily_stats").select("*").gte("day", range.from).lte("day", range.to).order("day")).data ?? [],
  });
  const campaigns = useQuery({
    queryKey: ["campaigns", "all"],
    queryFn: async () => (await supabase.from("campaigns").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const counts = useQuery({
    queryKey: ["counts"],
    queryFn: async () => {
      const [l, s] = await Promise.all([
        supabase.from("email_lists").select("id", { count: "exact", head: true }),
        supabase.from("subscribers").select("id", { count: "exact", head: true }),
      ]);
      return { lists: l.count ?? 0, subscribers: s.count ?? 0 };
    },
  });
  const activity = useQuery({
    queryKey: ["activity", "recent"],
    queryFn: async () => (await supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(8)).data ?? [],
  });

  const rows = stats.data ?? [];
  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const sent = sum("sent"), delivered = sum("delivered"), opens = sum("opens"), clicks = sum("clicks");
  const revenue = sum("revenue"), cost = sum("cost"), conversions = sum("conversions");
  const c = campaigns.data ?? [];

  const kpis = [
    { label: "Campaigns", value: fmtNum(c.length) },
    { label: "Running", value: fmtNum(c.filter((x) => x.status === "running").length) },
    { label: "Completed", value: fmtNum(c.filter((x) => x.status === "completed").length) },
    { label: "Sent", value: fmtCompact(sent) },
    { label: "Delivered", value: fmtCompact(delivered) },
    { label: "Opens", value: fmtCompact(opens) },
    { label: "Clicks", value: fmtCompact(clicks) },
    { label: "Bounces", value: fmtCompact(sum("bounces")) },
    { label: "Unsubscribes", value: fmtCompact(sum("unsubscribes")) },
    { label: "Spam complaints", value: fmtNum(sum("complaints")) },
    { label: "Deliverability", value: fmtPct(pct(delivered, sent)) },
    { label: "Open rate", value: fmtPct(pct(opens, delivered)) },
    { label: "Click rate", value: fmtPct(pct(clicks, delivered)) },
    { label: "Conversion rate", value: fmtPct(pct(conversions, clicks)) },
    { label: "Revenue", value: fmtMoney(revenue) },
    { label: "Spend", value: fmtMoney(cost) },
    { label: "Profit", value: fmtMoney(revenue - cost), accent: true },
    { label: "Lists", value: fmtNum(counts.data?.lists ?? 0) },
    { label: "Subscribers", value: fmtNum(counts.data?.subscribers ?? 0) },
    { label: "Domains", value: "—", hint: "Phase 4" },
  ];

  const chart = rows.map((r) => ({ day: r.day.slice(5), sent: r.sent, opens: r.opens, clicks: r.clicks, revenue: Number(r.revenue), cost: Number(r.cost) }));
  const scheduled = c.filter((x) => x.status === "scheduled");
  const failed = c.filter((x) => x.status === "failed");

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${range.from} → ${range.to}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup type="single" variant="outline" size="sm" value={period} onValueChange={(v) => v && setPeriod(v as Period)}>
              <ToggleGroupItem value="1">Today</ToggleGroupItem>
              <ToggleGroupItem value="7">7d</ToggleGroupItem>
              <ToggleGroupItem value="30">30d</ToggleGroupItem>
              <ToggleGroupItem value="90">90d</ToggleGroupItem>
              <ToggleGroupItem value="365">Year</ToggleGroupItem>
              <ToggleGroupItem value="custom">Custom</ToggleGroupItem>
            </ToggleGroup>
            {period === "custom" && (
              <div className="flex gap-1">
                <Input type="date" className="h-8 w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
                <Input type="date" className="h-8 w-36" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10">
        {kpis.map((k) => (
          <div key={k.label} className="bg-card px-3 py-3">
            <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
            <p className={`kpi-value mt-1 text-xl font-semibold ${k.accent ? "text-primary" : ""}`}>{k.value}</p>
            {k.hint && <p className="font-mono text-[10px] text-muted-foreground">{k.hint}</p>}
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Volume & engagement" className="lg:col-span-2">
          <div className="h-72 p-3">
            <ResponsiveContainer>
              <AreaChart data={chart}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" fontSize={11} stroke="var(--muted-foreground)" tickLine={false} />
                <YAxis fontSize={11} stroke="var(--muted-foreground)" tickFormatter={fmtCompact} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                <Area type="monotone" dataKey="sent" stroke="var(--chart-1)" fill="url(#g1)" strokeWidth={2} />
                <Area type="monotone" dataKey="opens" stroke="var(--chart-2)" fill="transparent" strokeWidth={2} />
                <Area type="monotone" dataKey="clicks" stroke="var(--chart-3)" fill="transparent" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Revenue vs spend">
          <div className="h-72 p-3">
            <ResponsiveContainer>
              <BarChart data={chart}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" fontSize={11} stroke="var(--muted-foreground)" tickLine={false} />
                <YAxis fontSize={11} stroke="var(--muted-foreground)" tickFormatter={fmtCompact} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="revenue" fill="var(--chart-5)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="cost" fill="var(--chart-4)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel title="Recent campaigns" action={<Link to="/campaigns" className="text-xs text-primary">All</Link>}>
          <ul className="divide-y">
            {c.slice(0, 6).map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <Link to="/campaigns/$id" params={{ id: x.id }} className="truncate hover:text-primary">{x.name}</Link>
                <StatusBadge status={x.status} />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Scheduled">
          <ul className="divide-y">
            {scheduled.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">Nothing scheduled.</li>}
            {scheduled.map((x) => (
              <li key={x.id} className="px-4 py-2 text-sm">
                <p className="truncate">{x.name}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{fmtDate(x.scheduled_at)}</p>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Failed tasks">
          <ul className="divide-y">
            {failed.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">No failures.</li>}
            {failed.map((x) => (
              <li key={x.id} className="flex justify-between px-4 py-2 text-sm">
                <span className="truncate">{x.name}</span>
                <span className="font-mono text-xs text-destructive">{fmtNum(x.bounces)} bounced</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Recent activity" action={<Link to="/activity" className="text-xs text-primary">All</Link>}>
          <ul className="divide-y">
            {(activity.data ?? []).length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">No activity yet.</li>}
            {(activity.data ?? []).map((a) => (
              <li key={a.id} className="px-4 py-2 text-sm">
                <p className="truncate"><span className="font-medium">{a.action}</span> · {a.details}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{fmtDate(a.created_at)}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
