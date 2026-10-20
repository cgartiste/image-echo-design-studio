import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteVipClient, listSesPool, listStaff, POOL_STATUSES, saveVipClient, updatePoolAccount, VIP_STATUSES } from "@/lib/vip.functions";
import { useMe } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { VipRecipients } from "@/components/vip-recipients";
import { t } from "@/lib/i18n";

const meta = "Tracked VIP recipients from campaign clicks and attributed conversions, with separate SES assignments.";
export const Route = createFileRoute("/_authenticated/vip")({
  head: () => ({ meta: [{ title: "VIP clients — Cortex" }, { name: "description", content: meta }, { property: "og:title", content: "VIP clients — Cortex" }, { property: "og:description", content: meta }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: VipPage,
});

const NONE = "__none";
type Client = {
  id?: string; company: string; contact_name: string | null; contact_email: string | null; owner_id: string | null;
  status: (typeof VIP_STATUSES)[number]; allowed_domains: string[]; ses_account_id: string | null; backup_account_id: string | null;
  internal_quota: number | null; notes: string | null;
};
const blank: Client = { company: "", contact_name: "", contact_email: "", owner_id: null, status: "pending", allowed_domains: [], ses_account_id: null, backup_account_id: null, internal_quota: null, notes: "" };

function VipPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const pool = useServerFn(listSesPool);
  const staffFn = useServerFn(listStaff);
  const savePool = useServerFn(updatePoolAccount);
  const del = useServerFn(deleteVipClient);
  const canView = me?.can("vip", "view");
  const canAssign = me?.can("vip", "assign");
  const { data: accounts = [] } = useQuery({ queryKey: ["ses-pool"], queryFn: () => pool(), enabled: !!canView });
  const { data: staff = [] } = useQuery({ queryKey: ["vip-staff"], queryFn: () => staffFn(), enabled: !!canView });
  const { data: clients = [] } = useQuery({
    queryKey: ["vip-clients"], enabled: !!canView,
    queryFn: async () => (await supabase.from("vip_clients").select("*").order("company")).data ?? [],
  });
  const [editing, setEditing] = useState<Client | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["vip-clients"] }); qc.invalidateQueries({ queryKey: ["ses-pool"] }); };
  const poolM = useMutation({
    mutationFn: (d: { id: string; is_vip: boolean; pool_status: (typeof POOL_STATUSES)[number]; region: string | null; daily_quota: number | null }) => savePool({ data: d }),
    onSuccess: () => { toast.success("Account updated"); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const delM = useMutation({ mutationFn: (id: string) => del({ data: { id } }), onSuccess: refresh, onError: (e) => toast.error((e as Error).message) });

  if (me && !canView) return <PageHeader title="VIP clients" subtitle="You don't have access to VIP clients." />;
  const vipAccounts = accounts.filter((a) => a.is_vip);
  const accName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? "—";

  return (
    <div>
      <PageHeader title="VIP clients" subtitle={`${vipAccounts.length} / 10 reserved Amazon SES accounts in the VIP pool.`}
        actions={me?.can("vip", "create") && <Button onClick={() => setEditing({ ...blank })}>Add VIP client</Button>} />
      <Tabs defaultValue="tracked">
        <TabsList className="flex h-auto flex-wrap justify-start"><TabsTrigger value="tracked">{t("vip.tracked")}</TabsTrigger><TabsTrigger value="clients">{t("vip.assignments")}</TabsTrigger><TabsTrigger value="pool">SES account pool</TabsTrigger></TabsList>
        <TabsContent value="tracked"><VipRecipients enabled={!!canView} /></TabsContent>
        <TabsContent value="clients">
          <Panel>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Company</TableHead><TableHead>Contact</TableHead><TableHead>Status</TableHead><TableHead>Primary SES</TableHead><TableHead>Backup</TableHead><TableHead>Domains</TableHead><TableHead>Quota</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {clients.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.company}</TableCell>
                      <TableCell className="text-sm"><div>{c.contact_name || "—"}</div><div className="text-xs text-muted-foreground">{c.contact_email}</div></TableCell>
                      <TableCell><Badge variant={c.status === "active" ? "outline" : "secondary"}>{c.status}</Badge></TableCell>
                      <TableCell className="text-sm">{accName(c.ses_account_id)}</TableCell>
                      <TableCell className="text-sm">{accName(c.backup_account_id)}</TableCell>
                      <TableCell className="max-w-48 truncate text-xs text-muted-foreground">{c.allowed_domains.join(", ") || "—"}</TableCell>
                      <TableCell className="text-sm">{c.internal_quota?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {me?.can("vip", "edit") && <Button size="sm" variant="ghost" onClick={() => setEditing(c as Client)}>Edit</Button>}
                        {me?.can("vip", "delete") && <Button size="sm" variant="ghost" onClick={() => confirm(`Delete ${c.company}?`) && delM.mutate(c.id)}>Delete</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!clients.length && <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No VIP clients yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </TabsContent>
        <TabsContent value="pool">
          <Panel>
            <p className="border-b p-3 text-sm text-muted-foreground">Add Amazon SES accounts on the Delivery Servers page, then reserve up to 10 of them for VIP clients here. A VIP account can only serve one VIP client.</p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>VIP</TableHead><TableHead>Pool status</TableHead><TableHead>Region</TableHead><TableHead>Daily quota</TableHead><TableHead>Assigned to</TableHead><TableHead>Last sync</TableHead></TableRow></TableHeader>
                <TableBody>
                  {accounts.map((a) => {
                    const base = { id: a.id, is_vip: a.is_vip, pool_status: a.pool_status as (typeof POOL_STATUSES)[number], region: a.region, daily_quota: a.daily_quota };
                    return (
                      <TableRow key={a.id}>
                        <TableCell><div className="font-medium">{a.name}</div>{a.last_error && <div className="max-w-56 truncate text-xs text-destructive">{a.last_error}</div>}</TableCell>
                        <TableCell><Switch checked={a.is_vip} disabled={!canAssign} onCheckedChange={(v) => poolM.mutate({ ...base, is_vip: v })} /></TableCell>
                        <TableCell>
                          <Select value={a.pool_status} disabled={!canAssign} onValueChange={(v) => poolM.mutate({ ...base, pool_status: v as typeof base.pool_status })}>
                            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>{POOL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input defaultValue={a.region ?? ""} placeholder="eu-west-1" disabled={!canAssign} className="h-8 w-28" onBlur={(e) => e.target.value !== (a.region ?? "") && poolM.mutate({ ...base, region: e.target.value || null })} /></TableCell>
                        <TableCell><Input type="number" defaultValue={a.daily_quota ?? ""} disabled={!canAssign} className="h-8 w-28" onBlur={(e) => { const n = e.target.value ? Number(e.target.value) : null; if (n !== a.daily_quota) poolM.mutate({ ...base, daily_quota: n }); }} /></TableCell>
                        <TableCell className="text-sm">{clients.find((c) => c.ses_account_id === a.id)?.company ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{a.last_sync_at ? fmtDate(a.last_sync_at) : "Never"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {!accounts.length && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No Amazon SES accounts connected yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
      {editing && <ClientDialog value={editing} onClose={() => setEditing(null)} onSaved={refresh} accounts={accounts} vipAccounts={vipAccounts} staff={staff} canAssign={!!canAssign} takenBy={(id) => clients.find((c) => c.ses_account_id === id && c.id !== editing.id)?.company} />}
    </div>
  );
}

function ClientDialog({ value, onClose, onSaved, accounts, vipAccounts, staff, canAssign, takenBy }: {
  value: Client; onClose: () => void; onSaved: () => void; canAssign: boolean;
  accounts: { id: string; name: string }[]; vipAccounts: { id: string; name: string }[];
  staff: { id: string; full_name: string | null; email: string | null }[]; takenBy: (id: string) => string | undefined;
}) {
  const save = useServerFn(saveVipClient);
  const [f, setF] = useState<Client>(value);
  const [domains, setDomains] = useState(value.allowed_domains.join(", "));
  const m = useMutation({
    mutationFn: () => save({ data: { ...f, contact_email: f.contact_email || null, allowed_domains: domains.split(/[\s,]+/).filter(Boolean) } }),
    onSuccess: () => { toast.success("VIP client saved"); onSaved(); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const set = (k: keyof Client, v: unknown) => setF({ ...f, [k]: v });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{value.id ? `Edit ${value.company}` : "New VIP client"}</DialogTitle></DialogHeader>
        <form id="vip" className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="space-y-1.5 sm:col-span-2"><Label>Company</Label><Input required value={f.company} onChange={(e) => set("company", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Main contact</Label><Input value={f.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Contact email</Label><Input type="email" value={f.contact_email ?? ""} onChange={(e) => set("contact_email", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Internal owner</Label>
            <Select value={f.owner_id ?? NONE} onValueChange={(v) => set("owner_id", v === NONE ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>—</SelectItem>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{VIP_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Primary SES account (VIP)</Label>
            <Select value={f.ses_account_id ?? NONE} disabled={!canAssign} onValueChange={(v) => set("ses_account_id", v === NONE ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>None</SelectItem>{vipAccounts.map((a) => { const t = takenBy(a.id); return <SelectItem key={a.id} value={a.id} disabled={!!t}>{a.name}{t ? ` — used by ${t}` : ""}</SelectItem>; })}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Backup SES account</Label>
            <Select value={f.backup_account_id ?? NONE} disabled={!canAssign} onValueChange={(v) => set("backup_account_id", v === NONE ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>None</SelectItem>{accounts.filter((a) => a.id !== f.ses_account_id).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Allowed sending domains</Label><Input value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="client.com, mail.client.com" /></div>
          <div className="space-y-1.5"><Label>Internal daily quota</Label><Input type="number" min={0} value={f.internal_quota ?? ""} onChange={(e) => set("internal_quota", e.target.value ? Number(e.target.value) : null)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Internal notes</Label><Textarea rows={3} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
          {!canAssign && <p className="text-xs text-muted-foreground sm:col-span-2">Only authorised staff can change SES account assignments.</p>}
        </form>
        <DialogFooter><Button type="submit" form="vip" disabled={m.isPending}>{m.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
