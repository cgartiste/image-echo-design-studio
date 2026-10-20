import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inviteMember, listTeam, setMemberSuspended, updateMember } from "@/lib/team.functions";
import { ROLE_LABELS, useMe } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

const meta = "Invite employees, set roles and suspend access.";
export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Team — Cortex" }, { name: "description", content: meta }, { property: "og:title", content: "Team — Cortex" }, { property: "og:description", content: meta }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: TeamPage,
});

const ROLES = ["admin", "manager", "operator", "analyst", "viewer"] as const;
type Role = (typeof ROLES)[number];

function TeamPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const list = useServerFn(listTeam);
  const update = useServerFn(updateMember);
  const suspend = useServerFn(setMemberSuspended);
  const allowed = me?.can("users", "manage_users");
  const { data = [], error } = useQuery({ queryKey: ["team"], queryFn: () => list(), enabled: !!allowed });
  const [q, setQ] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["team"] });
  const act = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => { toast.success("Saved"); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });

  if (me && !allowed) return <PageHeader title="Team" subtitle="You don't have access to team management." />;
  const rows = data.filter((u) => !q || `${u.email} ${u.name} ${u.department}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader title="Team" subtitle="Access is by invitation only. Suspending someone signs them out of new sessions and blocks sign-in." actions={<InviteDialog onDone={refresh} />} />
      <Panel>
        <div className="border-b p-3"><Input placeholder="Search name, email, department…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 max-w-sm" /></div>
        {error && <p className="p-4 text-sm text-destructive">{(error as Error).message}</p>}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>2FA</TableHead><TableHead>Last sign-in</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rows.map((u) => {
                const isOwner = u.roles.includes("super_admin");
                const isSelf = u.id === me?.user.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell><div className="font-medium">{u.name || "—"}</div><div className="text-xs text-muted-foreground">{u.email}</div></TableCell>
                    <TableCell>
                      <Input defaultValue={u.department} placeholder="—" className="h-8 w-32" disabled={isOwner}
                        onBlur={(e) => e.target.value !== u.department && act.mutate(() => update({ data: { userId: u.id, department: e.target.value } }))} />
                    </TableCell>
                    <TableCell>
                      {isOwner || isSelf ? <span className="text-sm">{u.roles.map((r) => ROLE_LABELS[r]).join(", ") || "—"}</span> : (
                        <Select value={u.roles[0] ?? ""} onValueChange={(v) => act.mutate(() => update({ data: { userId: u.id, role: v as Role } }))}>
                          <SelectTrigger className="h-8 w-32"><SelectValue placeholder="No role" /></SelectTrigger>
                          <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.suspended ? <Badge variant="destructive">Suspended</Badge>
                        : !u.confirmed ? <Badge variant="secondary">Invited</Badge>
                        : <Badge variant="outline">Active</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">{u.mfa ? "On" : "Off"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.lastSignIn ? fmtDate(u.lastSignIn) : "Never"}</TableCell>
                    <TableCell className="text-right">
                      {!isOwner && !isSelf && (
                        <Button size="sm" variant={u.suspended ? "outline" : "destructive"} disabled={act.isPending}
                          onClick={() => act.mutate(() => suspend({ data: { userId: u.id, suspended: !u.suspended } }))}>
                          {u.suspended ? "Reactivate" : "Suspend"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!rows.length && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No employees found.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}

function InviteDialog({ onDone }: { onDone: () => void }) {
  const invite = useServerFn(inviteMember);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: "", name: "", department: "", role: "operator" as Role });
  const m = useMutation({
    mutationFn: () => invite({ data: f }),
    onSuccess: () => { toast.success(`Invitation sent to ${f.email}`); setOpen(false); setF({ email: "", name: "", department: "", role: "operator" }); onDone(); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>Invite employee</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Invite an employee</DialogTitle></DialogHeader>
        <form id="invite" className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="space-y-1.5"><Label>Work email</Label><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Full name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Department</Label><Input value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} placeholder="Deliverability, Marketing…" /></div>
          <div className="space-y-1.5"><Label>Role</Label>
            <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v as Role })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </form>
        <DialogFooter><Button type="submit" form="invite" disabled={m.isPending}>{m.isPending ? "Sending…" : "Send invitation"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
