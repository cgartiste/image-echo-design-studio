import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { campaignDay, monthGrid } from "@/lib/calendar";

const meta = "Monthly calendar of scheduled, running and finished campaigns.";
export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "Campaign calendar — Cortex" }, { name: "description", content: meta }, { property: "og:title", content: "Campaign calendar — Cortex" }, { property: "og:description", content: meta }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: CalendarPage,
});

const TONE: Record<string, string> = {
  scheduled: "bg-info/15 text-info", running: "bg-success/15 text-success", paused: "bg-warning/15 text-warning",
  completed: "bg-muted text-muted-foreground", draft: "bg-secondary text-secondary-foreground", cancelled: "bg-destructive/10 text-destructive",
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function CalendarPage() {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const grid = monthGrid(ym.y, ym.m);
  const today = now.toISOString().slice(0, 10);
  const { data: campaigns = [] } = useQuery({
    queryKey: ["calendar-campaigns", grid[0]],
    queryFn: async () => (await supabase.from("campaigns").select("id,name,status,scheduled_at,started_at,created_at,recipient_count").limit(2000)).data ?? [],
  });
  const byDay = new Map<string, typeof campaigns>();
  for (const c of campaigns) { const d = campaignDay(c); byDay.set(d, [...(byDay.get(d) ?? []), c]); }
  const shift = (n: number) => setYm(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const label = new Date(ym.y, ym.m, 1).toLocaleDateString("en", { month: "long", year: "numeric" });
  const monthKey = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}`;

  return (
    <div>
      <PageHeader title="Campaign calendar" subtitle="Campaigns appear on their scheduled date, otherwise their start or creation date."
        actions={<div className="flex items-center gap-2">
          <Button size="icon" variant="outline" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="w-36 text-center text-sm font-medium">{label}</span>
          <Button size="icon" variant="outline" aria-label="Next month" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })}>Today</Button>
        </div>} />
      <Panel className="overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-7 border-b text-xs font-medium text-muted-foreground">
          {DAYS.map((d) => <div key={d} className="px-2 py-2">{d}</div>)}
        </div>
        <div className="grid min-w-[700px] grid-cols-7">
          {grid.map((d) => {
            const items = byDay.get(d) ?? [];
            return (
              <div key={d} className={cn("min-h-28 border-b border-r p-1.5", !d.startsWith(monthKey) && "bg-muted/30 text-muted-foreground")}>
                <div className={cn("mb-1 text-xs", d === today && "inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground")}>{Number(d.slice(8))}</div>
                <div className="space-y-1">
                  {items.slice(0, 3).map((c) => (
                    <Link key={c.id} to="/campaigns/$id" params={{ id: c.id }} title={`${c.name} · ${c.status}`}
                      className={cn("block truncate rounded px-1.5 py-0.5 text-[11px] hover:opacity-80", TONE[c.status] ?? "bg-muted")}>{c.name}</Link>
                  ))}
                  {items.length > 3 && <div className="px-1 text-[11px] text-muted-foreground">+{items.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
