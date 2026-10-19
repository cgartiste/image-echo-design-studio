import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/page";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({ meta: [{ title: "Activity log — Cortex" }, { name: "description", content: "Audit trail of sensitive actions." }] }),
  component: ActivityPage,
});

function ActivityPage() {
  const [q, setQ] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["activity", "all"],
    queryFn: async () => (await supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(500)).data ?? [],
  });
  const rows = data.filter((a) => !q || `${a.user_email} ${a.module} ${a.action} ${a.details}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader title="Activity log" subtitle="Every create, edit, delete, import, export and execution." />
      <Panel>
        <div className="border-b p-3"><Input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-full sm:w-72" /></div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Module</TableHead><TableHead>Action</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No activity yet.</TableCell></TableRow>}
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{fmtDate(a.created_at)}</TableCell>
                  <TableCell className="text-sm">{a.user_email}</TableCell>
                  <TableCell className="text-sm capitalize">{a.module}</TableCell>
                  <TableCell><span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]">{a.action}</span></TableCell>
                  <TableCell className="max-w-md truncate text-sm text-muted-foreground">{a.details}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
