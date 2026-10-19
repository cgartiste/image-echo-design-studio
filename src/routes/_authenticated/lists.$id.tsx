import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Download, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, StatusBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { download, parseSubscribers, toCsv } from "@/lib/csv";
import { fmtDate, fmtNum } from "@/lib/format";
import { logActivity, useMe } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/lists/$id")({
  head: () => ({ meta: [{ title: "List subscribers — Cortex" }, { name: "description", content: "Subscribers in this list." }] }),
  component: ListPage,
});

const PAGE = 25;
const EXPORT_COLS = ["email", "first_name", "last_name", "phone", "country", "region", "city", "language", "ip", "source", "status", "tags", "engagement", "bounce_count", "unsubscribed", "blocked", "subscribed_at", "last_open_at", "last_click_at"];

function subStatus(s: { blocked: boolean; unsubscribed: boolean; status: string }) {
  return s.blocked ? "blocked" : s.unsubscribed ? "unsubscribed" : s.status;
}

function ListPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<number | null>(null);
  const [bulk, setBulk] = useState<null | "add_tag" | "remove_tag" | "move" | "copy">(null);
  const [bulkVal, setBulkVal] = useState("");

  const list = useQuery({ queryKey: ["lists", id], queryFn: async () => (await supabase.from("email_lists").select("*").eq("id", id).maybeSingle()).data });
  const allLists = useQuery({ queryKey: ["lists", "options"], queryFn: async () => (await supabase.from("email_lists").select("id,name").order("name")).data ?? [] });
  const subs = useQuery({
    queryKey: ["subscribers", id],
    queryFn: async () => {
      const out: NonNullable<Awaited<ReturnType<typeof fetchPage>>> = [];
      for (let from = 0; ; from += 1000) {
        const chunk = await fetchPage(id, from);
        out.push(...chunk);
        if (chunk.length < 1000) break;
      }
      return out;
    },
  });

  const filtered = useMemo(
    () => (subs.data ?? []).filter((s) =>
      (status === "all" || subStatus(s) === status) &&
      (!q || `${s.email} ${s.first_name ?? ""} ${s.last_name ?? ""} ${s.country ?? ""} ${s.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()))),
    [subs.data, q, status],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const rows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["subscribers"] }); qc.invalidateQueries({ queryKey: ["lists"] }); setSel(new Set()); };

  async function importFile(f?: File) {
    if (!f) return;
    const { rows: parsed, invalid, duplicates } = parseSubscribers(await f.text());
    const existing = new Set((subs.data ?? []).map((s) => s.email));
    const fresh = parsed.filter((r) => !existing.has(r.email));
    const already = parsed.length - fresh.length;
    setProgress(0);
    const size = 500;
    for (let i = 0; i < fresh.length; i += size) {
      const batch = fresh.slice(i, i + size).map((r) => ({ ...r, email: r.email, list_id: id, source: r["source"] ?? `import:${f.name}` }));
      const { error } = await supabase.from("subscribers").upsert(batch, { onConflict: "list_id,email", ignoreDuplicates: true });
      if (error) { setProgress(null); { toast.error(error.message); return; } }
      setProgress(Math.round(((i + batch.length) / fresh.length) * 100));
    }
    setProgress(null);
    await supabase.from("email_lists").update({ updated_at: new Date().toISOString() }).eq("id", id);
    await logActivity("lists", "import", `${f.name}: ${fresh.length} added, ${invalid} invalid, ${duplicates + already} duplicates`);
    toast.success(`Imported ${fmtNum(fresh.length)} · ${invalid} invalid skipped · ${duplicates + already} duplicates skipped`);
    refresh();
  }

  function exportRows(onlyFiltered: boolean) {
    const data = onlyFiltered ? filtered : subs.data ?? [];
    download(`${list.data?.name ?? "list"}${onlyFiltered ? "-filtered" : ""}.csv`, toCsv(data as never, EXPORT_COLS));
    logActivity("lists", "export", `${list.data?.name}: ${data.length} rows`);
  }

  const ids = [...sel];
  async function bulkUpdate(patch: { unsubscribed?: boolean; blocked?: boolean }, label: string) {
    const { error } = await supabase.from("subscribers").update(patch).in("id", ids);
    if (error) { toast.error(error.message); return; }
    await logActivity("lists", `bulk_${label}`, `${ids.length} subscribers`);
    toast.success(`${ids.length} subscribers updated`);
    refresh();
  }
  async function bulkDelete() {
    if (!confirm(`Delete ${ids.length} subscribers?`)) return;
    const { error } = await supabase.from("subscribers").delete().in("id", ids);
    if (error) { toast.error(error.message); return; }
    await logActivity("lists", "bulk_delete", `${ids.length} subscribers`);
    refresh();
  }
  async function applyBulk() {
    const chosen = (subs.data ?? []).filter((s) => sel.has(s.id));
    if (bulk === "add_tag" || bulk === "remove_tag") {
      const tag = bulkVal.trim().slice(0, 40);
      if (!tag) { toast.error("Enter a tag"); return; }
      for (const s of chosen) {
        const tags = bulk === "add_tag" ? [...new Set([...s.tags, tag])] : s.tags.filter((t) => t !== tag);
        await supabase.from("subscribers").update({ tags }).eq("id", s.id);
      }
      await logActivity("lists", `bulk_${bulk}`, `${tag} on ${chosen.length}`);
    } else if (bulk === "move" || bulk === "copy") {
      if (!bulkVal) { toast.error("Choose a list"); return; }
      const copies = chosen.map(({ id: _i, created_at: _c, list_id: _l, ...r }) => ({ ...r, list_id: bulkVal }));
      const { error } = await supabase.from("subscribers").upsert(copies, { onConflict: "list_id,email", ignoreDuplicates: true });
      if (error) { toast.error(error.message); return; }
      if (bulk === "move") await supabase.from("subscribers").delete().in("id", ids);
      await logActivity("lists", `bulk_${bulk}`, `${chosen.length} subscribers`);
    }
    toast.success("Done");
    setBulk(null);
    setBulkVal("");
    refresh();
  }

  const canEdit = me?.can("lists", "edit");

  return (
    <div>
      <Link to="/lists" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" /> Lists</Link>
      <PageHeader
        title={list.data?.name ?? "List"}
        subtitle={`${fmtNum(subs.data?.length ?? 0)} subscribers · updated ${fmtDate(list.data?.updated_at)}`}
        actions={
          <>
            {me?.can("lists", "create") && (
              <Button variant="outline" asChild>
                <label className="cursor-pointer"><Upload className="h-4 w-4" /> Import CSV / TXT
                  <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              </Button>
            )}
            {me?.can("lists", "export") && (
              <>
                <Button variant="outline" onClick={() => exportRows(false)}><Download className="h-4 w-4" /> Export all</Button>
                <Button variant="outline" onClick={() => exportRows(true)}>Export filtered</Button>
              </>
            )}
          </>
        }
      />
      {progress !== null && (
        <Panel className="mb-4 p-3"><p className="mb-2 text-sm">Importing… {progress}%</p><Progress value={progress} /></Panel>
      )}
      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Input placeholder="Search email, name, country, tag…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="h-9 w-full sm:w-72" />
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["all", "active", "unsubscribed", "blocked"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s === "all" ? "All statuses" : s}</SelectItem>)}
            </SelectContent>
          </Select>
          {sel.size > 0 && canEdit && (
            <div className="flex flex-wrap items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs">
              <span className="mr-1 font-medium">{sel.size} selected</span>
              <Button size="sm" variant="ghost" onClick={() => setBulk("add_tag")}>Add tag</Button>
              <Button size="sm" variant="ghost" onClick={() => setBulk("remove_tag")}>Remove tag</Button>
              <Button size="sm" variant="ghost" onClick={() => setBulk("move")}>Move</Button>
              <Button size="sm" variant="ghost" onClick={() => setBulk("copy")}>Copy</Button>
              <Button size="sm" variant="ghost" onClick={() => bulkUpdate({ unsubscribed: true }, "unsubscribe")}>Unsubscribe</Button>
              <Button size="sm" variant="ghost" onClick={() => bulkUpdate({ unsubscribed: false }, "resubscribe")}>Resubscribe</Button>
              <Button size="sm" variant="ghost" onClick={() => bulkUpdate({ blocked: true }, "block")}>Block</Button>
              <Button size="sm" variant="ghost" onClick={() => bulkUpdate({ blocked: false }, "unblock")}>Unblock</Button>
              {me?.can("lists", "delete") && <Button size="sm" variant="ghost" className="text-destructive" onClick={bulkDelete}>Delete</Button>}
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={rows.length > 0 && rows.every((r) => sel.has(r.id))}
                    onCheckedChange={(v) => setSel((s) => { const n = new Set(s); rows.forEach((r) => (v ? n.add(r.id) : n.delete(r.id))); return n; })}
                  />
                </TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="hidden md:table-cell">Name</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Tags</TableHead>
                <TableHead className="hidden text-right md:table-cell">Engagement</TableHead>
                <TableHead className="hidden xl:table-cell">Last open</TableHead>
                <TableHead className="hidden xl:table-cell">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.isLoading && <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!subs.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No subscribers. Import a CSV to get started.</TableCell></TableRow>}
              {rows.map((s) => (
                <TableRow key={s.id} data-state={sel.has(s.id) ? "selected" : undefined}>
                  <TableCell><Checkbox checked={sel.has(s.id)} onCheckedChange={(v) => setSel((p) => { const n = new Set(p); v ? n.add(s.id) : n.delete(s.id); return n; })} /></TableCell>
                  <TableCell className="font-mono text-xs">{s.email}</TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{[s.first_name, s.last_name].filter(Boolean).join(" ") || "—"}</TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">{[s.city, s.country].filter(Boolean).join(", ") || "—"}</TableCell>
                  <TableCell><StatusBadge status={subStatus(s)} /></TableCell>
                  <TableCell className="hidden sm:table-cell">{s.tags.map((t) => <span key={t} className="mr-1 rounded bg-secondary px-1.5 py-0.5 text-[11px]">{t}</span>)}</TableCell>
                  <TableCell className="hidden text-right font-mono text-xs md:table-cell">{s.engagement}</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">{fmtDate(s.last_open_at)}</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">{s.source ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <span>{fmtNum(filtered.length)} results · page {page + 1} of {pages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      </Panel>

      <Dialog open={!!bulk} onOpenChange={(o) => !o && setBulk(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{bulk === "add_tag" ? "Add tag" : bulk === "remove_tag" ? "Remove tag" : bulk === "move" ? "Move to list" : "Copy to list"}</DialogTitle></DialogHeader>
          {bulk === "add_tag" || bulk === "remove_tag" ? (
            <Input placeholder="Tag" value={bulkVal} onChange={(e) => setBulkVal(e.target.value)} />
          ) : (
            <Select value={bulkVal} onValueChange={setBulkVal}>
              <SelectTrigger><SelectValue placeholder="Choose list" /></SelectTrigger>
              <SelectContent>{(allLists.data ?? []).filter((l) => l.id !== id).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <DialogFooter><Button onClick={applyBulk}>Apply to {sel.size}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

async function fetchPage(listId: string, from: number) {
  return (await supabase.from("subscribers").select("*").eq("list_id", listId).order("created_at", { ascending: false }).range(from, from + 999)).data ?? [];
}
