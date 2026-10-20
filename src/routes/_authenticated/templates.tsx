import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const meta = "Reusable email templates with subject, preheader and HTML, previewed live.";
export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({ meta: [{ title: "Templates — Cortex" }, { name: "description", content: meta }, { property: "og:title", content: "Templates — Cortex" }, { property: "og:description", content: meta }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: TemplatesPage,
});

type Tpl = { id?: string; name: string; category: string; subject: string; preheader: string | null; html_content: string; updated_at?: string };
const blank: Tpl = { name: "", category: "general", subject: "", preheader: "", html_content: "<!doctype html>\n<html><body style=\"font-family:Arial,sans-serif\">\n  <p>Hello {first_name},</p>\n  <p><a href=\"{unsubscribe_url}\">Unsubscribe</a></p>\n</body></html>" };

function TemplatesPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [cur, setCur] = useState<Tpl | null>(null);
  const [q, setQ] = useState("");
  const { data: list = [] } = useQuery({ queryKey: ["templates"], queryFn: async () => ((await supabase.from("email_templates").select("*").order("updated_at", { ascending: false })).data ?? []) as Tpl[] });
  const canEdit = !!me?.can("campaigns", cur?.id ? "edit" : "create");

  const save = useMutation({
    mutationFn: async (t: Tpl) => {
      if (!t.name.trim()) throw new Error("Name is required");
      const row = { name: t.name.trim(), category: t.category.trim() || "general", subject: t.subject, preheader: t.preheader || null, html_content: t.html_content, updated_at: new Date().toISOString() };
      const res = t.id ? await supabase.from("email_templates").update(row).eq("id", t.id).select().single()
        : await supabase.from("email_templates").insert({ ...row, created_by: me?.id ?? null }).select().single();
      if (res.error) throw res.error;
      return res.data as Tpl;
    },
    onSuccess: (t) => { setCur(t); qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Template saved"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("email_templates").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { setCur(null); qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Template deleted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const shown = list.filter((t) => `${t.name} ${t.category} ${t.subject}`.toLowerCase().includes(q.toLowerCase()));
  const set = (k: keyof Tpl) => (e: { target: { value: string } }) => cur && setCur({ ...cur, [k]: e.target.value });

  return (
    <div>
      <PageHeader title="Templates" subtitle="Save reusable designs, then copy them into a campaign."
        actions={me?.can("campaigns", "create") && <Button onClick={() => setCur({ ...blank })}><Plus className="mr-1 h-4 w-4" />New template</Button>} />
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Panel title="Library">
          <div className="p-3">
            <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
            {shown.length === 0 ? <p className="text-sm text-muted-foreground">No templates yet.</p> : (
              <div className="space-y-1">
                {shown.map((t) => (
                  <button key={t.id} type="button" onClick={() => setCur(t)} className={cn("w-full rounded-md px-2 py-2 text-left hover:bg-muted", cur?.id === t.id && "bg-muted")}>
                    <div className="truncate text-sm font-medium">{t.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{t.category} · {fmtDate(t.updated_at)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Panel>
        {!cur ? <Panel><p className="p-6 text-sm text-muted-foreground">Pick a template or create a new one.</p></Panel> : (
          <Panel title={cur.id ? "Edit template" : "New template"}
            action={<div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(cur.html_content); toast.success("HTML copied"); }}><Copy className="mr-1 h-4 w-4" />Copy HTML</Button>
              {cur.id && me?.can("campaigns", "delete") && <Button size="sm" variant="outline" aria-label="Delete template" onClick={() => confirm(`Delete ${cur.name}?`) && del.mutate(cur.id!)}><Trash2 className="h-4 w-4" /></Button>}
              {canEdit && <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(cur)}><Save className="mr-1 h-4 w-4" />Save</Button>}
            </div>}>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <Input placeholder="Name" value={cur.name} onChange={set("name")} disabled={!canEdit} />
              <Input placeholder="Category" value={cur.category} onChange={set("category")} disabled={!canEdit} />
              <Input placeholder="Subject" value={cur.subject} onChange={set("subject")} disabled={!canEdit} />
              <Input placeholder="Preheader" value={cur.preheader ?? ""} onChange={set("preheader")} disabled={!canEdit} />
            </div>
            <div className="grid gap-3 px-4 pb-4 xl:grid-cols-2">
              <Textarea value={cur.html_content} onChange={set("html_content")} disabled={!canEdit} className="min-h-[420px] font-mono text-xs" aria-label="HTML" />
              <iframe title="Preview" sandbox="" srcDoc={cur.html_content} className="min-h-[420px] w-full rounded-md border bg-background" />
            </div>
            {!/\{unsubscribe_url\}|unsubscribe/i.test(cur.html_content) && <p className="px-4 pb-4 text-xs text-warning">No unsubscribe link found — campaigns using this design cannot be scheduled.</p>}
          </Panel>
        )}
      </div>
    </div>
  );
}
