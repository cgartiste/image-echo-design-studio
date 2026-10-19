import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Archive, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, StatusBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { fmtDate, fmtNum } from "@/lib/format";
import { logActivity, useMe } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/lists/")({
  head: () => ({ meta: [{ title: "Email Lists — Cortex" }, { name: "description", content: "Manage email lists and subscribers." }] }),
  component: Lists,
});

type Edit = { id?: string; name: string; description: string; is_active: boolean };

function Lists() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [del, setDel] = useState<{ id: string; name: string } | null>(null);

  const { data = [] } = useQuery({
    queryKey: ["lists", "full"],
    queryFn: async () => (await supabase.from("email_lists").select("*, subscribers(count)").order("created_at", { ascending: false })).data ?? [],
  });
  const rows = data.filter((l) => l.is_archived === showArchived && (!q || l.name.toLowerCase().includes(q.toLowerCase())));
  const refresh = () => qc.invalidateQueries({ queryKey: ["lists"] });

  async function save() {
    if (!edit || !edit.name.trim()) { toast.error("Name is required"); return; }
    const payload = { name: edit.name.trim().slice(0, 120), description: edit.description.slice(0, 500) || null, is_active: edit.is_active, updated_at: new Date().toISOString() };
    const { error } = edit.id
      ? await supabase.from("email_lists").update(payload).eq("id", edit.id)
      : await supabase.from("email_lists").insert({ ...payload, created_by: me?.user.id ?? null });
    if (error) { toast.error(error.message); return; }
    await logActivity("lists", edit.id ? "edit" : "create", edit.name);
    toast.success(edit.id ? "List updated" : "List created");
    setEdit(null);
    refresh();
  }
  async function archive(id: string, name: string, v: boolean) {
    const { error } = await supabase.from("email_lists").update({ is_archived: v }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logActivity("lists", v ? "archive" : "unarchive", name);
    refresh();
  }
  async function remove() {
    if (!del) return;
    const { error } = await supabase.from("email_lists").delete().eq("id", del.id);
    if (error) { toast.error(error.message); return; }
    await logActivity("lists", "delete", del.name);
    toast.success("List deleted");
    setDel(null);
    refresh();
  }

  return (
    <div>
      <PageHeader
        title="Email Lists"
        subtitle={`${rows.length} ${showArchived ? "archived" : "active"} lists`}
        actions={me?.can("lists", "create") && <Button onClick={() => setEdit({ name: "", description: "", is_active: true })}><Plus className="h-4 w-4" /> New list</Button>}
      />
      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b p-3">
          <Input placeholder="Search lists…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-full sm:w-64" />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} /> Show archived
          </label>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Subscribers</TableHead>
                <TableHead className="hidden md:table-cell">Last update</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No lists.</TableCell></TableRow>}
              {rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link to="/lists/$id" params={{ id: l.id }} className="font-medium hover:text-primary">{l.name}</Link>
                    {l.description && <p className="max-w-sm truncate text-xs text-muted-foreground">{l.description}</p>}
                  </TableCell>
                  <TableCell><StatusBadge status={l.is_active ? "active" : "inactive"} /></TableCell>
                  <TableCell className="text-right font-mono">{fmtNum(l.subscribers?.[0]?.count ?? 0)}</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{fmtDate(l.updated_at)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {me?.can("lists", "edit") && <DropdownMenuItem onClick={() => setEdit({ id: l.id, name: l.name, description: l.description ?? "", is_active: l.is_active })}><Pencil className="h-4 w-4" /> Edit</DropdownMenuItem>}
                        {me?.can("lists", "edit") && <DropdownMenuItem onClick={() => archive(l.id, l.name, !l.is_archived)}><Archive className="h-4 w-4" /> {l.is_archived ? "Unarchive" : "Archive"}</DropdownMenuItem>}
                        {me?.can("lists", "delete") && <DropdownMenuItem className="text-destructive" onClick={() => setDel({ id: l.id, name: l.name })}><Trash2 className="h-4 w-4" /> Delete</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Edit list" : "New list"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="space-y-1"><Label>Name</Label><Input value={edit.name} maxLength={120} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Description</Label><Textarea value={edit.description} maxLength={500} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={edit.is_active} onCheckedChange={(v) => setEdit({ ...edit, is_active: v })} /> Active</label>
            </div>
          )}
          <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{del?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>All subscribers in this list will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={remove}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
