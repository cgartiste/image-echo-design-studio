import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMe } from "@/lib/auth";

const meta = "Organise campaigns, lists, offers and segments with tags and categories.";
export const Route = createFileRoute("/_authenticated/taxonomy")({
  head: () => ({ meta: [{ title: "Tags & categories — Cortex" }, { name: "description", content: meta }, { property: "og:title", content: "Tags & categories — Cortex" }, { property: "og:description", content: meta }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: TaxonomyPage,
});

const COLORS = ["slate", "red", "amber", "green", "blue", "violet", "pink"] as const;
// Hue tokens are decorative chip dots; they use the theme's chart/status tokens.
const DOT: Record<string, string> = { slate: "bg-muted-foreground", red: "bg-destructive", amber: "bg-warning", green: "bg-success", blue: "bg-info", violet: "bg-primary", pink: "bg-chart-5" };
type Entity = "campaign" | "list" | "offer" | "segment";
type Tag = { id: string; name: string; kind: string; color: string };

function TaxonomyPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: async () => (await supabase.from("tags").select("*").order("kind").order("name")).data ?? [] });
  const { data: taggings = [] } = useQuery({ queryKey: ["taggings"], queryFn: async () => (await supabase.from("taggings").select("*")).data ?? [] });
  const [name, setName] = useState("");
  const [kind, setKind] = useState("tag");
  const [color, setColor] = useState<string>("blue");
  const canEdit = !!me?.can("campaigns", "edit");
  const inv = () => { qc.invalidateQueries({ queryKey: ["tags"] }); qc.invalidateQueries({ queryKey: ["taggings"] }); };
  const add = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("tags").insert({ name: name.trim(), kind, color, created_by: me!.user.id }); if (error) throw error; },
    onSuccess: () => { setName(""); inv(); }, onError: (e) => toast.error((e as Error).message.includes("duplicate") ? "That name already exists" : (e as Error).message),
  });
  const del = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from("tags").delete().eq("id", id); if (error) throw error; }, onSuccess: inv, onError: (e) => toast.error((e as Error).message) });

  return (
    <div>
      <PageHeader title="Tags & categories" subtitle="Create labels once, then attach them to campaigns, lists, offers and segments." />
      <Panel className="mb-4 p-4">
        {canEdit && (
          <form className="mb-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}>
            <Input className="w-56" placeholder="New label name" value={name} onChange={(e) => setName(e.target.value)} />
            <Select value={kind} onValueChange={setKind}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tag">Tag</SelectItem><SelectItem value="category">Category</SelectItem></SelectContent></Select>
            <Select value={color} onValueChange={setColor}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{COLORS.map((c) => <SelectItem key={c} value={c}><span className={`mr-2 inline-block h-2 w-2 rounded-full ${DOT[c]}`} />{c}</SelectItem>)}</SelectContent></Select>
            <Button type="submit" disabled={add.isPending}>Add</Button>
          </form>
        )}
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm">
              <span className={`h-2 w-2 rounded-full ${DOT[t.color]}`} />{t.name}
              <span className="text-xs text-muted-foreground">{t.kind === "category" ? "category" : ""} · {taggings.filter((g) => g.tag_id === t.id).length}</span>
              {me?.can("campaigns", "delete") && <button aria-label={`Delete ${t.name}`} onClick={() => confirm(`Delete ${t.name}?`) && del.mutate(t.id)}><X className="h-3 w-3" /></button>}
            </span>
          ))}
          {!tags.length && <p className="text-sm text-muted-foreground">No labels yet.</p>}
        </div>
      </Panel>
      <Tabs defaultValue="campaign">
        <TabsList><TabsTrigger value="campaign">Campaigns</TabsTrigger><TabsTrigger value="list">Lists</TabsTrigger><TabsTrigger value="offer">Offers</TabsTrigger><TabsTrigger value="segment">Segments</TabsTrigger></TabsList>
        {(["campaign", "list", "offer", "segment"] as Entity[]).map((e) => <TabsContent key={e} value={e}><Assign entity={e} tags={tags as Tag[]} taggings={taggings} canEdit={canEdit} onChange={inv} /></TabsContent>)}
      </Tabs>
    </div>
  );
}

const SOURCES: Record<Entity, { table: "campaigns" | "email_lists" | "offers" | "segments" }> = { campaign: { table: "campaigns" }, list: { table: "email_lists" }, offer: { table: "offers" }, segment: { table: "segments" } };

function Assign({ entity, tags, taggings, canEdit, onChange }: { entity: Entity; tags: Tag[]; taggings: { tag_id: string; entity_type: string; entity_id: string }[]; canEdit: boolean; onChange: () => void }) {
  const [filter, setFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const { data: rows = [] } = useQuery({
    queryKey: ["tax-rows", entity],
    queryFn: async () => ((await supabase.from(SOURCES[entity].table).select("id,name").order("name").limit(500)).data ?? []) as { id: string; name: string }[],
  });
  const toggle = useMutation({
    mutationFn: async ({ tag, id, on }: { tag: string; id: string; on: boolean }) => {
      const { error } = on ? await supabase.from("taggings").insert({ tag_id: tag, entity_type: entity, entity_id: id }) : await supabase.from("taggings").delete().eq("tag_id", tag).eq("entity_type", entity).eq("entity_id", id);
      if (error) throw error;
    },
    onSuccess: onChange, onError: (e) => toast.error((e as Error).message),
  });
  const has = (tag: string, id: string) => taggings.some((g) => g.tag_id === tag && g.entity_type === entity && g.entity_id === id);
  const shown = rows.filter((r) => (!filter || r.name.toLowerCase().includes(filter.toLowerCase())) && (tagFilter === "all" || has(tagFilter, r.id)));
  return (
    <Panel>
      <div className="flex flex-wrap gap-2 border-b p-3">
        <Input className="h-9 w-64" placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <Select value={tagFilter} onValueChange={setTagFilter}><SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All labels</SelectItem>{tags.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="divide-y">
        {shown.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 p-3">
            <span className="min-w-48 flex-1 text-sm font-medium">{r.name}</span>
            {tags.map((t) => {
              const on = has(t.id, r.id);
              return (
                <button key={t.id} disabled={!canEdit || toggle.isPending} onClick={() => toggle.mutate({ tag: t.id, id: r.id, on: !on })}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${on ? "border-primary bg-primary/10" : "opacity-50 hover:opacity-100"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${DOT[t.color]}`} />{t.name}
                </button>
              );
            })}
          </div>
        ))}
        {!shown.length && <p className="p-6 text-center text-sm text-muted-foreground">Nothing to show.</p>}
      </div>
    </Panel>
  );
}
