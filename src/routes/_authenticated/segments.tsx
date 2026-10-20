import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { cleanRules, describeRules, type SegmentRules } from "@/lib/segments";

const meta = "Dynamic audiences built from rules, usable in any campaign.";
export const Route = createFileRoute("/_authenticated/segments")({
  head: () => ({ meta: [{ title: "Segments — Cortex" }, { name: "description", content: meta }, { property: "og:title", content: "Segments — Cortex" }, { property: "og:description", content: meta }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: SegmentsPage,
});

type Seg = { id?: string; name: string; description: string | null; rules: SegmentRules };
const blank: Seg = { name: "", description: "", rules: {} };

function SegmentsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const { data: segments = [] } = useQuery({ queryKey: ["segments"], queryFn: async () => (await supabase.from("segments").select("*").order("name")).data ?? [] });
  const { data: lists = [] } = useQuery({ queryKey: ["lists-min"], queryFn: async () => (await supabase.from("email_lists").select("id,name").eq("is_archived", false).order("name")).data ?? [] });
  const [edit, setEdit] = useState<Seg | null>(null);
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("segments").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["segments"] }), onError: (e) => toast.error((e as Error).message),
  });
  const listName = (id: string) => lists.find((l) => l.id === id)?.name ?? "list";

  return (
    <div>
      <PageHeader title="Segments" subtitle="Audiences that update themselves. Pick a segment in a campaign and only matching contacts are queued."
        actions={me?.can("lists", "create") && <Button onClick={() => setEdit({ ...blank, rules: {} })}>New segment</Button>} />
      {edit && <Editor value={edit} lists={lists} onClose={() => setEdit(null)} />}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {segments.map((s) => (
          <Panel key={s.id} className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">{s.name}</h3>
              <span className="font-mono text-lg">{s.last_count?.toLocaleString() ?? "—"}</span>
            </div>
            {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
            <ul className="mt-2 flex-1 space-y-0.5 text-xs text-muted-foreground">{describeRules(s.rules as SegmentRules, listName).map((d) => <li key={d}>• {d}</li>)}</ul>
            <p className="mt-2 text-[11px] text-muted-foreground">{s.last_counted_at ? `Counted ${fmtDate(s.last_counted_at)}` : "Not counted yet"}</p>
            <div className="mt-2 flex gap-1">
              {me?.can("lists", "edit") && <Button size="sm" variant="outline" onClick={() => setEdit({ id: s.id, name: s.name, description: s.description, rules: s.rules as SegmentRules })}>Edit</Button>}
              {me?.can("lists", "delete") && <Button size="sm" variant="ghost" onClick={() => confirm(`Delete ${s.name}?`) && del.mutate(s.id)}>Delete</Button>}
            </div>
          </Panel>
        ))}
        {!segments.length && !edit && <Panel className="p-8 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">No segments yet. Create one, e.g. “Openers last 30 days in France”.</Panel>}
      </div>
    </div>
  );
}

function Editor({ value, lists, onClose }: { value: Seg; lists: { id: string; name: string }[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [s, setS] = useState<Seg>(value);
  const [count, setCount] = useState<number | null>(null);
  const r = s.rules;
  const setR = (patch: Partial<SegmentRules>) => setS({ ...s, rules: { ...r, ...patch } });
  const csv = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
  const n = (v: string) => (v === "" ? undefined : Number(v));

  useEffect(() => {
    const id = setTimeout(async () => {
      const { data, error } = await supabase.rpc("segment_count", { rules: cleanRules(s.rules) as never });
      setCount(error ? null : (data as number));
    }, 400);
    return () => clearTimeout(id);
  }, [s.rules]);

  const save = useMutation({
    mutationFn: async () => {
      const row = { name: s.name.trim(), description: s.description || null, rules: cleanRules(s.rules) as never, last_count: count, last_counted_at: new Date().toISOString() };
      if (!row.name) throw new Error("Name required");
      const { error } = s.id ? await supabase.from("segments").update({ ...row, updated_at: new Date().toISOString() }).eq("id", s.id) : await supabase.from("segments").insert({ ...row, created_by: me!.user.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Segment saved"); qc.invalidateQueries({ queryKey: ["segments"] }); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const numField = (k: keyof SegmentRules, label: string, hint?: string) => (
    <div className="space-y-1"><Label className="text-xs">{label}</Label><Input type="number" min={0} value={(r[k] as number | undefined) ?? ""} placeholder={hint} onChange={(e) => setR({ [k]: n(e.target.value) } as Partial<SegmentRules>)} /></div>
  );

  return (
    <Panel className="mb-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Name</Label><Input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></div>
          <div className="space-y-1"><Label>Description</Label><Textarea rows={1} value={s.description ?? ""} onChange={(e) => setS({ ...s, description: e.target.value })} /></div>
        </div>
        <div className="rounded-md border px-4 py-2 text-center"><div className="font-mono text-2xl">{count?.toLocaleString() ?? "…"}</div><div className="text-xs text-muted-foreground">matching contacts</div></div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div>
          <h4 className="mb-2 text-sm font-semibold">Lists (empty = all)</h4>
          <div className="max-h-40 space-y-1.5 overflow-y-auto">{lists.map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-sm"><Checkbox checked={(r.lists ?? []).includes(l.id)} onCheckedChange={(c) => setR({ lists: c ? [...(r.lists ?? []), l.id] : (r.lists ?? []).filter((x) => x !== l.id) })} />{l.name}</label>
          ))}</div>
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Profile</h4>
          <div className="space-y-1"><Label className="text-xs">Countries (comma separated)</Label><Input value={(r.countries ?? []).join(", ")} placeholder="FR, BE" onChange={(e) => setR({ countries: csv(e.target.value) })} /></div>
          <div className="space-y-1"><Label className="text-xs">Languages</Label><Input value={(r.languages ?? []).join(", ")} placeholder="fr, en" onChange={(e) => setR({ languages: csv(e.target.value) })} /></div>
          <div className="space-y-1"><Label className="text-xs">Has any tag</Label><Input value={(r.tags_any ?? []).join(", ")} onChange={(e) => setR({ tags_any: csv(e.target.value) })} /></div>
          <div className="space-y-1"><Label className="text-xs">Has none of these tags</Label><Input value={(r.tags_none ?? []).join(", ")} onChange={(e) => setR({ tags_none: csv(e.target.value) })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2 self-start">
          <h4 className="col-span-2 text-sm font-semibold">Behaviour</h4>
          {numField("engagement_min", "Engagement ≥")}
          {numField("engagement_max", "Engagement ≤")}
          {numField("opened_within_days", "Opened in last … days")}
          {numField("clicked_within_days", "Clicked in last … days")}
          {numField("inactive_days", "Inactive for … days")}
          {numField("not_sent_within_days", "Not emailed for … days")}
          {numField("subscribed_within_days", "Joined in last … days")}
          {numField("max_bounces", "Max bounces")}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Unsubscribed, blocked and suppressed contacts are always excluded.</p>
      <div className="mt-3 flex gap-2"><Button onClick={() => save.mutate()} disabled={save.isPending}>Save segment</Button><Button variant="ghost" onClick={onClose}>Cancel</Button></div>
    </Panel>
  );
}
