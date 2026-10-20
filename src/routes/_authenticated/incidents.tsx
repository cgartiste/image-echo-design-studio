import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMe } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { hoursToResolve, SEVERITIES, STATUSES, statusPatch, type Status } from "@/lib/incidents";

const meta = "Track delivery incidents from detection to resolution, with a timeline and root cause.";
export const Route = createFileRoute("/_authenticated/incidents")({
  head: () => ({ meta: [{ title: "Incidents — Cortex" }, { name: "description", content: meta }, { property: "og:title", content: "Incidents — Cortex" }, { property: "og:description", content: meta }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: IncidentsPage,
});

const SEV: Record<string, string> = { low: "bg-muted text-muted-foreground", medium: "bg-info/15 text-info", high: "bg-warning/15 text-warning", critical: "bg-destructive/15 text-destructive" };
const AREAS = ["deliverability", "amazon ses", "dns", "servers", "tracking", "data", "other"];

function IncidentsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<{ title: string; severity: string; area: string; description: string } | null>(null);
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("active");
  const { data: incidents = [] } = useQuery({ queryKey: ["incidents"], queryFn: async () => (await supabase.from("incidents").select("*").order("created_at", { ascending: false }).limit(500)).data ?? [] });
  const cur = incidents.find((i) => i.id === sel) ?? null;
  const { data: notes = [] } = useQuery({ enabled: !!sel, queryKey: ["incident-notes", sel], queryFn: async () => (await supabase.from("incident_notes").select("*").eq("incident_id", sel!).order("created_at")).data ?? [] });
  const inv = () => qc.invalidateQueries({ queryKey: ["incidents"] });
  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed");

  const create = useMutation({
    mutationFn: async () => {
      if (!form?.title.trim()) throw new Error("Title is required");
      const { data, error } = await supabase.from("incidents").insert({ title: form.title.trim(), severity: form.severity, area: form.area, description: form.description || null, created_by: me?.user.id ?? null }).select("id").single();
      if (error) throw error; return data.id;
    },
    onSuccess: (id) => { inv(); setForm(null); setSel(id); toast.success("Incident opened"); }, onError: err,
  });
  const update = useMutation({
    mutationFn: async (patch: { status?: string; severity?: string; resolved_at?: string | null; updated_at?: string; root_cause?: string | null; resolution?: string | null }) => { const { error } = await supabase.from("incidents").update(patch).eq("id", sel!); if (error) throw error; },
    onSuccess: inv, onError: err,
  });
  const addNote = useMutation({
    mutationFn: async () => { if (!note.trim()) return; const { error } = await supabase.from("incident_notes").insert({ incident_id: sel!, body: note.trim(), author_email: me?.user.email ?? null, created_by: me?.user.id ?? null }); if (error) throw error; },
    onSuccess: () => { setNote(""); qc.invalidateQueries({ queryKey: ["incident-notes", sel] }); }, onError: err,
  });

  const shown = incidents.filter((i) => filter === "all" || (filter === "active" ? i.status !== "resolved" : i.status === "resolved"));
  const resolved = incidents.map(hoursToResolve).filter((h): h is number => h !== null);
  const mttr = resolved.length ? Math.round((resolved.reduce((a, b) => a + b, 0) / resolved.length) * 10) / 10 : null;
  const canEdit = !!me?.can("servers", "edit");

  return (
    <div className="space-y-4">
      <PageHeader title="Incidents" subtitle={`${incidents.filter((i) => i.status !== "resolved").length} active · average resolution ${mttr ?? "—"} h`}
        actions={<Button onClick={() => { setSel(null); setForm({ title: "", severity: "medium", area: "deliverability", description: "" }); }}><Plus className="mr-1 h-4 w-4" />Open incident</Button>} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Panel>
          <div className="p-3">
            <Select value={filter} onValueChange={setFilter}><SelectTrigger className="mb-3"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="all">All</SelectItem></SelectContent></Select>
            {shown.length === 0 ? <p className="text-sm text-muted-foreground">No incidents.</p> : shown.map((i) => (
              <button key={i.id} type="button" onClick={() => { setForm(null); setSel(i.id); }} className={cn("mb-1 w-full rounded-md px-2 py-2 text-left hover:bg-muted", sel === i.id && "bg-muted")}>
                <div className="flex items-center gap-2"><span className={cn("rounded px-1.5 text-[10px] uppercase", SEV[i.severity])}>{i.severity}</span><span className="truncate text-sm font-medium">{i.title}</span></div>
                <div className="text-xs text-muted-foreground">{i.area} · {i.status} · {fmtDate(i.created_at)}</div>
              </button>
            ))}
          </div>
        </Panel>
        {form ? (
          <Panel title="New incident">
            <div className="grid gap-3 p-4">
              <Input placeholder="What happened?" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
                <Select value={form.area} onValueChange={(v) => setForm({ ...form, area: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{AREAS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
              </div>
              <Textarea placeholder="Details, impact, affected campaigns or accounts" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div><Button disabled={create.isPending} onClick={() => create.mutate()}>Open incident</Button></div>
            </div>
          </Panel>
        ) : !cur ? <Panel><p className="p-6 text-sm text-muted-foreground">Select an incident or open a new one.</p></Panel> : (
          <Panel title={cur.title} action={<Badge variant="outline">{cur.area}</Badge>}>
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Select value={cur.status} disabled={!canEdit} onValueChange={(v) => update.mutate(statusPatch(v as Status))}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
                <Select value={cur.severity} disabled={!canEdit} onValueChange={(v) => update.mutate({ severity: v, updated_at: new Date().toISOString() })}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
                <span className="text-xs text-muted-foreground">Opened {fmtDate(cur.created_at)}{cur.resolved_at && ` · resolved in ${hoursToResolve(cur)} h`}</span>
              </div>
              {cur.description && <p className="whitespace-pre-wrap text-sm">{cur.description}</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <Textarea key={`rc-${cur.id}`} placeholder="Root cause" defaultValue={cur.root_cause ?? ""} disabled={!canEdit} onBlur={(e) => e.target.value !== (cur.root_cause ?? "") && update.mutate({ root_cause: e.target.value || null })} />
                <Textarea key={`rs-${cur.id}`} placeholder="Resolution" defaultValue={cur.resolution ?? ""} disabled={!canEdit} onBlur={(e) => e.target.value !== (cur.resolution ?? "") && update.mutate({ resolution: e.target.value || null })} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
                <div className="space-y-2 border-l pl-4">
                  {notes.map((n) => <div key={n.id} className="text-sm"><div className="text-xs text-muted-foreground">{n.author_email ?? "—"} · {fmtDate(n.created_at)}</div><p className="whitespace-pre-wrap">{n.body}</p></div>)}
                  {notes.length === 0 && <p className="text-xs text-muted-foreground">No updates yet.</p>}
                </div>
                <div className="mt-3 flex gap-2"><Input placeholder="Add an update…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote.mutate()} /><Button variant="outline" onClick={() => addNote.mutate()}>Post</Button></div>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
