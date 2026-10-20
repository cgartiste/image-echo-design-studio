import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMe } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { AUDIENCES, estimateAudience, followupDueAt, type Audience } from "@/lib/followups";

const meta = "Plan follow-up emails to openers, non-openers or clickers of a campaign.";
export const Route = createFileRoute("/_authenticated/followups")({
  head: () => ({ meta: [{ title: "Follow-ups — Cortex" }, { name: "description", content: meta }, { property: "og:title", content: "Follow-ups — Cortex" }, { property: "og:description", content: meta }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: FollowupsPage,
});

function FollowupsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const { data: campaigns = [] } = useQuery({ queryKey: ["fu-campaigns"], queryFn: async () => (await supabase.from("campaigns").select("id,name,status,started_at,ended_at,delivered,opens,clicks").order("created_at", { ascending: false }).limit(500)).data ?? [] });
  const { data: templates = [] } = useQuery({ queryKey: ["templates-min"], queryFn: async () => (await supabase.from("email_templates").select("id,name").order("name")).data ?? [] });
  const { data: rows = [] } = useQuery({ queryKey: ["followups"], queryFn: async () => (await supabase.from("campaign_followups").select("*").order("created_at", { ascending: false })).data ?? [] });
  const [f, setF] = useState({ parent: "", name: "", audience: "non_openers" as Audience, delay: "48", template: "", subject: "" });
  const inv = () => qc.invalidateQueries({ queryKey: ["followups"] });

  const add = useMutation({
    mutationFn: async () => {
      if (!f.parent || !f.name.trim()) throw new Error("Pick a campaign and enter a name");
      const delay = Number(f.delay);
      if (!Number.isInteger(delay) || delay < 1 || delay > 720) throw new Error("Delay must be 1 to 720 hours");
      const { error } = await supabase.from("campaign_followups").insert({ parent_campaign_id: f.parent, name: f.name.trim(), audience: f.audience, delay_hours: delay, template_id: f.template || null, subject: f.subject, created_by: me?.user.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => { inv(); setF({ ...f, name: "", subject: "" }); toast.success("Follow-up planned"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const toggle = useMutation({ mutationFn: async (v: { id: string; active: boolean }) => { const { error } = await supabase.from("campaign_followups").update({ active: v.active }).eq("id", v.id); if (error) throw error; }, onSuccess: inv, onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") });
  const del = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from("campaign_followups").delete().eq("id", id); if (error) throw error; }, onSuccess: inv, onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") });

  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const tplName = new Map(templates.map((t) => [t.id, t.name]));

  return (
    <div className="space-y-4">
      <PageHeader title="Follow-ups" subtitle="Plan a second email for people who opened, clicked or ignored a campaign. Sending stays blocked until a sender is connected." />
      {me?.can("campaigns", "create") && (
        <Panel title="New follow-up">
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select value={f.parent} onValueChange={(v) => setF({ ...f, parent: v })}><SelectTrigger><SelectValue placeholder="Original campaign" /></SelectTrigger>
              <SelectContent>{campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
            <Select value={f.audience} onValueChange={(v) => setF({ ...f, audience: v as Audience })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(AUDIENCES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
            <Input type="number" min={1} max={720} value={f.delay} onChange={(e) => setF({ ...f, delay: e.target.value })} aria-label="Delay in hours" placeholder="Hours after send" />
            <Input placeholder="Follow-up name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <Input placeholder="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
            <Select value={f.template} onValueChange={(v) => setF({ ...f, template: v })}><SelectTrigger><SelectValue placeholder="Template (optional)" /></SelectTrigger>
              <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="px-4 pb-4"><Button disabled={add.isPending} onClick={() => add.mutate()}>Add follow-up</Button></div>
        </Panel>
      )}
      <Panel title="Planned follow-ups">
        {rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">None yet.</p> : (
          <div className="divide-y">
            {rows.map((r) => {
              const p = byId.get(r.parent_campaign_id);
              const due = p ? followupDueAt(p, r.delay_hours) : null;
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {AUDIENCES[r.audience as Audience]} of {p ? <Link to="/campaigns/$id" params={{ id: p.id }} className="underline">{p.name}</Link> : "deleted campaign"} · {r.delay_hours} h later
                      {r.template_id && ` · ${tplName.get(r.template_id) ?? "template"}`}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{p ? `~${estimateAudience(r.audience as Audience, p).toLocaleString()} people` : ""}</div>
                  <div className="w-40 text-xs">{due ? `Due ${fmtDate(due.toISOString())}` : "Waits for the original to send"}</div>
                  <Switch checked={r.active} disabled={!me?.can("campaigns", "edit")} onCheckedChange={(v) => toggle.mutate({ id: r.id, active: v })} aria-label="Active" />
                  {me?.can("campaigns", "delete") && <Button size="icon" variant="ghost" aria-label="Delete follow-up" onClick={() => del.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
