import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowUpDown, Copy, MoreHorizontal, Plus, Archive, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, StatusBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CAMPAIGN_STATUSES } from "@/lib/campaign-status";
import { fmtDate, fmtNum, fmtPct, pct } from "@/lib/format";
import { logActivity, useMe } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/campaigns/")({
  head: () => ({ meta: [{ title: "Campaigns — Cortex" }, { name: "description", content: "Manage email campaigns." }] }),
  component: Campaigns,
});

type SortKey = "name" | "status" | "sent" | "created_at" | "open_rate";
const PAGE = 15;

function Campaigns() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [listId, setListId] = useState("all");
  const [from, setFrom] = useState("");
  const [sort, setSort] = useState<{ k: SortKey; asc: boolean }>({ k: "created_at", asc: false });
  const [page, setPage] = useState(0);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["campaigns", "list"],
    queryFn: async () => (await supabase.from("campaigns").select("*, email_lists(name)").order("created_at", { ascending: false })).data ?? [],
  });
  const lists = useQuery({
    queryKey: ["lists", "options"],
    queryFn: async () => (await supabase.from("email_lists").select("id,name").order("name")).data ?? [],
  });

  const filtered = useMemo(() => {
    const rows = data.filter(
      (c) =>
        (status === "all" || c.status === status) &&
        (listId === "all" || c.list_id === listId) &&
        (!from || c.created_at >= from) &&
        (!q || `${c.name} ${c.subject} ${c.offer ?? ""}`.toLowerCase().includes(q.toLowerCase())),
    );
    const val = (c: (typeof rows)[number]) => (sort.k === "open_rate" ? pct(c.opens, c.delivered) : c[sort.k]);
    return rows.sort((a, b) => {
      const x = val(a), y = val(b);
      const r = x! < y! ? -1 : x! > y! ? 1 : 0;
      return sort.asc ? r : -r;
    });
  }, [data, q, status, listId, from, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const rows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const refresh = () => qc.invalidateQueries({ queryKey: ["campaigns"] });

  async function duplicate(id: string) {
    const src = data.find((c) => c.id === id);
    if (!src) return;
    const { id: _i, created_at: _c, updated_at: _u, email_lists: _l, ...rest } = src;
    const { data: row, error } = await supabase
      .from("campaigns")
      .insert({ ...rest, name: `${src.name} (copy)`, status: "draft", sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0, unsubscribes: 0, complaints: 0, conversions: 0, revenue: 0, cost: 0, created_by: me?.user.id ?? null })
      .select("id")
      .single();
    if (error) { toast.error(error.message); return; }
    await logActivity("campaigns", "duplicate", src.name);
    toast.success("Campaign duplicated");
    refresh();
    navigate({ to: "/campaigns/$id", params: { id: row.id } });
  }
  async function archive(id: string, name: string) {
    const { error } = await supabase.from("campaigns").update({ status: "archived" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logActivity("campaigns", "archive", name);
    toast.success("Archived");
    refresh();
  }
  async function remove() {
    if (!toDelete) return;
    const { error } = await supabase.from("campaigns").delete().eq("id", toDelete.id);
    if (error) { toast.error(error.message); return; }
    await logActivity("campaigns", "delete", toDelete.name);
    toast.success("Campaign deleted");
    setToDelete(null);
    refresh();
  }

  const SortHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button className="inline-flex items-center gap-1" onClick={() => setSort((s) => ({ k, asc: s.k === k ? !s.asc : false }))}>
        {children} <ArrowUpDown className="h-3 w-3 opacity-50" />
      </button>
    </TableHead>
  );

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle={`${filtered.length} campaigns`}
        actions={me?.can("campaigns", "create") && (
          <Button asChild><Link to="/campaigns/new"><Plus className="h-4 w-4" /> New campaign</Link></Button>
        )}
      />
      <Panel>
        <div className="flex flex-wrap gap-2 border-b p-3">
          <Input placeholder="Search name, subject, offer…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="h-9 w-full sm:w-64" />
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {CAMPAIGN_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={listId} onValueChange={(v) => { setListId(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lists</SelectItem>
              {(lists.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" aria-label="Created after" />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead k="name">Name</SortHead>
                <SortHead k="status">Status</SortHead>
                <TableHead className="hidden md:table-cell">List</TableHead>
                <TableHead className="hidden lg:table-cell">Offer</TableHead>
                <SortHead k="sent" className="text-right">Sent</SortHead>
                <SortHead k="open_rate" className="text-right">Open</SortHead>
                <TableHead className="hidden text-right sm:table-cell">Click</TableHead>
                <SortHead k="created_at" className="hidden xl:table-cell">Created</SortHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No campaigns match.</TableCell></TableRow>}
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link to="/campaigns/$id" params={{ id: c.id }} className="font-medium hover:text-primary">{c.name}</Link>
                    <p className="max-w-xs truncate text-xs text-muted-foreground">{c.subject}</p>
                  </TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{c.email_lists?.name ?? "—"}</TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">{c.offer ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtNum(c.sent)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtPct(pct(c.opens, c.delivered))}</TableCell>
                  <TableCell className="hidden text-right font-mono text-sm sm:table-cell">{fmtPct(pct(c.clicks, c.delivered))}</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">{fmtDate(c.created_at)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate({ to: "/campaigns/$id", params: { id: c.id } })}><Pencil className="h-4 w-4" /> Open</DropdownMenuItem>
                        {me?.can("campaigns", "create") && <DropdownMenuItem onClick={() => duplicate(c.id)}><Copy className="h-4 w-4" /> Duplicate</DropdownMenuItem>}
                        {me?.can("campaigns", "edit") && c.status !== "archived" && <DropdownMenuItem onClick={() => archive(c.id, c.name)}><Archive className="h-4 w-4" /> Archive</DropdownMenuItem>}
                        {me?.can("campaigns", "delete") && <DropdownMenuItem className="text-destructive" onClick={() => setToDelete({ id: c.id, name: c.name })}><Trash2 className="h-4 w-4" /> Delete</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <span>Page {page + 1} of {pages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      </Panel>
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{toDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the campaign, its stats and its logs.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
