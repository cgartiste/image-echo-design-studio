import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMe } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { parseSuppressionInput, SUPPRESSION_REASONS, type SuppressionReason } from "@/lib/suppression";

const meta = "Global do-not-send list applied to every campaign.";
export const Route = createFileRoute("/_authenticated/suppression")({
  head: () => ({ meta: [{ title: "Suppression list — Cortex" }, { name: "description", content: meta }, { property: "og:title", content: "Suppression list — Cortex" }, { property: "og:description", content: meta }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: SuppressionPage,
});

const LABELS: Record<SuppressionReason, string> = { hard_bounce: "Hard bounce", complaint: "Complaint", unsubscribe: "Unsubscribe", manual: "Manual", legal: "Legal request" };

function SuppressionPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [raw, setRaw] = useState("");
  const [reason, setReason] = useState<SuppressionReason>("manual");
  const { data = [] } = useQuery({
    queryKey: ["suppressions", q],
    queryFn: async () => {
      let req = supabase.from("suppressions").select("*").order("created_at", { ascending: false }).limit(500);
      if (q.trim()) req = req.ilike("email", `%${q.trim().toLowerCase()}%`);
      return (await req).data ?? [];
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      const { valid, invalid } = parseSuppressionInput(raw);
      if (!valid.length) throw new Error("No valid email addresses found");
      const uid = me!.user.id;
      const { error } = await supabase.from("suppressions").upsert(valid.map((email) => ({ email, reason, source: "manual", created_by: uid })), { onConflict: "email", ignoreDuplicates: true });
      if (error) throw error;
      return { added: valid.length, invalid: invalid.length };
    },
    onSuccess: (r) => { toast.success(`${r.added} address(es) suppressed${r.invalid ? ` · ${r.invalid} invalid skipped` : ""}`); setRaw(""); qc.invalidateQueries({ queryKey: ["suppressions"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("suppressions").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppressions"] }),
    onError: (e) => toast.error((e as Error).message),
  });

  if (me && !me.can("suppression", "view")) return <PageHeader title="Suppression list" subtitle="You don't have access to this list." />;
  return (
    <div>
      <PageHeader title="Suppression list" subtitle="Addresses here are never added to any campaign queue, whatever list they belong to." />
      {me?.can("suppression", "create") && (
        <Panel className="mb-4 space-y-3 p-4">
          <Textarea rows={4} placeholder="Paste addresses — one per line, or separated by commas" value={raw} onChange={(e) => setRaw(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={reason} onValueChange={(v) => setReason(v as SuppressionReason)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{SUPPRESSION_REASONS.map((r) => <SelectItem key={r} value={r}>{LABELS[r]}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={() => add.mutate()} disabled={add.isPending || !raw.trim()}>Suppress</Button>
          </div>
        </Panel>
      )}
      <Panel>
        <div className="border-b p-3"><Input placeholder="Search an address…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 max-w-sm" /></div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Reason</TableHead><TableHead>Source</TableHead><TableHead>Added</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-sm">{s.email}</TableCell>
                  <TableCell><Badge variant="outline">{LABELS[s.reason as SuppressionReason] ?? s.reason}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.source ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(s.created_at)}</TableCell>
                  <TableCell className="text-right">{me?.can("suppression", "delete") && <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)}>Remove</Button>}</TableCell>
                </TableRow>
              ))}
              {!data.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No suppressed addresses.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
