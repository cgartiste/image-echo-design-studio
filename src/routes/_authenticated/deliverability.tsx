import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, OctagonX, RefreshCw } from "lucide-react";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deliverabilityState, resolveAlert, saveThresholds, setEmergencyStop, syncSesHealth, updateRouting } from "@/lib/deliverability.functions";
import { planRoute, type RoutableAccount } from "@/lib/routing";
import { useMe } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

const meta = "SES routing, quotas, alerts and the emergency stop.";
export const Route = createFileRoute("/_authenticated/deliverability")({
  head: () => ({ meta: [{ title: "Deliverability control — Cortex" }, { name: "description", content: meta }, { property: "og:title", content: "Deliverability control — Cortex" }, { property: "og:description", content: meta }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: DeliverabilityPage,
});

const STANDARD = "__standard";

function DeliverabilityPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const stateFn = useServerFn(deliverabilityState);
  const stopFn = useServerFn(setEmergencyStop);
  const syncFn = useServerFn(syncSesHealth);
  const resolveFn = useServerFn(resolveAlert);
  const canView = me?.can("servers", "view");
  const canSettings = me?.can("servers", "settings");
  const { data } = useQuery({ queryKey: ["deliverability"], queryFn: () => stateFn(), enabled: !!canView, refetchInterval: 30_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["deliverability"] });
  const [reason, setReason] = useState("");
  const stop = useMutation({
    mutationFn: (on: boolean) => stopFn({ data: { on, reason } }),
    onSuccess: (_r, on) => { toast.success(on ? "Emergency stop active — all sending frozen" : "Emergency stop lifted"); setReason(""); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => { toast.success(`${r.results.filter((x) => x.ok).length}/${r.results.length} accounts synced · ${r.imported} suppressed addresses imported`); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const resolve = useMutation({ mutationFn: (id: string) => resolveFn({ data: { id } }), onSuccess: refresh });

  if (me && !canView) return <PageHeader title="Deliverability control" subtitle="You don't have access to this page." />;
  const c = data?.controls;
  const stopped = !!c?.emergency_stop;
  const name = (id: string | null) => data?.accounts.find((a) => a.id === id)?.name ?? "—";

  return (
    <div>
      <PageHeader title="Deliverability control" subtitle="Which Amazon SES account carries each campaign, health limits, alerts and the emergency stop."
        actions={me?.can("servers", "execute") && <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}><RefreshCw className={sync.isPending ? "animate-spin" : ""} />Sync SES accounts</Button>} />

      <Panel className={`mb-4 p-4 ${stopped ? "border-destructive bg-destructive/5" : ""}`}>
        <div className="flex flex-wrap items-start gap-4">
          <OctagonX className={`mt-0.5 h-6 w-6 shrink-0 ${stopped ? "text-destructive" : "text-muted-foreground"}`} />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{stopped ? "Emergency stop is ACTIVE" : "Emergency stop"}</h2>
            <p className="text-sm text-muted-foreground">
              {stopped ? `${c?.reason ?? ""} · since ${c?.changed_at ? fmtDate(c.changed_at) : "—"}. No campaign can start and no server picks up messages.`
                : "Freezes every send queue instantly and pauses all delivery servers."}
            </p>
            {canSettings && !stopped && <Textarea className="mt-2 max-w-lg" rows={2} placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />}
          </div>
          {canSettings && (stopped
            ? <Button variant="outline" onClick={() => stop.mutate(false)} disabled={stop.isPending}>Lift emergency stop</Button>
            : <Button variant="destructive" onClick={() => confirm("Freeze ALL sending now?") && stop.mutate(true)} disabled={stop.isPending || reason.trim().length < 3}>Stop all sending</Button>)}
        </div>
      </Panel>

      <Tabs defaultValue="routing">
        <TabsList>
          <TabsTrigger value="routing">Routing & quotas</TabsTrigger>
          <TabsTrigger value="simulate">Route simulator</TabsTrigger>
          <TabsTrigger value="alerts">Alerts {data?.alerts.length ? <Badge variant="destructive" className="ml-1.5 h-5 px-1.5">{data.alerts.length}</Badge> : null}</TabsTrigger>
          <TabsTrigger value="limits">Health limits</TabsTrigger>
        </TabsList>
        <TabsContent value="routing"><RoutingTable accounts={(data?.accounts ?? []) as RoutableAccount[] & Record<string, unknown>[]} canEdit={!!canSettings} onSaved={refresh} thresholds={{ bounce: Number(c?.bounce_threshold ?? 5), complaint: Number(c?.complaint_threshold ?? 0.1) }} /></TabsContent>
        <TabsContent value="simulate"><Simulator accounts={(data?.accounts ?? []) as RoutableAccount[]} vipClients={data?.vipClients ?? []} thresholds={{ bounce: Number(c?.bounce_threshold ?? 5), complaint: Number(c?.complaint_threshold ?? 0.1) }} /></TabsContent>
        <TabsContent value="alerts">
          <Panel>
            <Table>
              <TableHeader><TableRow><TableHead>Level</TableHead><TableHead>Message</TableHead><TableHead>Raised</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {(data?.alerts ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell><Badge variant={a.level === "critical" ? "destructive" : a.level === "warning" ? "secondary" : "outline"}>{a.level}</Badge></TableCell>
                    <TableCell className="text-sm">{a.message}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(a.created_at)}</TableCell>
                    <TableCell className="text-right">{me?.can("servers", "execute") && <Button size="sm" variant="ghost" onClick={() => resolve.mutate(a.id)}>Resolve</Button>}</TableCell>
                  </TableRow>
                ))}
                {!data?.alerts.length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No open alerts.</TableCell></TableRow>}
              </TableBody>
            </Table>
            {!!data?.events.length && (
              <div className="border-t p-3">
                <h3 className="mb-2 text-sm font-semibold">Failover history</h3>
                {data.events.map((e) => <p key={e.id} className="text-xs text-muted-foreground">{fmtDate(e.created_at)} · {name(e.from_account)} → {name(e.to_account)} · {e.reason}</p>)}
              </div>
            )}
          </Panel>
        </TabsContent>
        <TabsContent value="limits">{c && <Limits bounce={Number(c.bounce_threshold)} complaint={Number(c.complaint_threshold)} canEdit={!!canSettings} onSaved={refresh} />}</TabsContent>
      </Tabs>
    </div>
  );
}

function RoutingTable({ accounts, canEdit, onSaved, thresholds }: { accounts: (RoutableAccount & Record<string, unknown>)[]; canEdit: boolean; onSaved: () => void; thresholds: { bounce: number; complaint: number } }) {
  const save = useServerFn(updateRouting);
  const m = useMutation({ mutationFn: (d: { id: string; routing_priority: number; bounce_rate: number | null; complaint_rate: number | null }) => save({ data: d }), onSuccess: onSaved, onError: (e) => toast.error((e as Error).message) });
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <Panel>
      <p className="border-b p-3 text-sm text-muted-foreground">Standard campaigns use non-VIP accounts from the lowest priority number upward. Accounts over a health limit or out of quota are skipped automatically. Quotas come from “Sync SES accounts”.</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Priority</TableHead><TableHead>Today</TableHead><TableHead>Rate/s</TableHead><TableHead>Bounce %</TableHead><TableHead>Complaint %</TableHead><TableHead>Access</TableHead><TableHead>State</TableHead></TableRow></TableHeader>
          <TableBody>
            {accounts.map((a) => {
              const base = { id: a.id, routing_priority: a.routing_priority, bounce_rate: a.bounce_rate, complaint_rate: a.complaint_rate };
              const used = a.daily_quota ? Math.round((a.sent_today / a.daily_quota) * 100) : null;
              const bad = (a.bounce_rate ?? 0) >= thresholds.bounce || (a.complaint_rate ?? 0) >= thresholds.complaint;
              return (
                <TableRow key={a.id}>
                  <TableCell><div className="font-medium">{a.name} {a.is_vip && <Badge variant="outline" className="ml-1">VIP</Badge>}</div><div className="text-xs text-muted-foreground">{String(a["region"] ?? "")}</div></TableCell>
                  <TableCell><Input type="number" className="h-8 w-20" defaultValue={a.routing_priority} disabled={!canEdit} onBlur={(e) => Number(e.target.value) !== a.routing_priority && m.mutate({ ...base, routing_priority: Number(e.target.value) })} /></TableCell>
                  <TableCell className="text-sm">{a.sent_today.toLocaleString()} / {a.daily_quota?.toLocaleString() ?? "?"}{used != null && <div className="mt-1 h-1.5 w-24 rounded bg-muted"><div className={`h-1.5 rounded ${used >= 90 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, used)}%` }} /></div>}</TableCell>
                  <TableCell className="text-sm">{String(a["max_send_rate"] ?? "—")}</TableCell>
                  <TableCell><Input type="number" step="0.01" className="h-8 w-20" defaultValue={a.bounce_rate ?? ""} disabled={!canEdit} onBlur={(e) => num(e.target.value) !== a.bounce_rate && m.mutate({ ...base, bounce_rate: num(e.target.value) })} /></TableCell>
                  <TableCell><Input type="number" step="0.01" className="h-8 w-20" defaultValue={a.complaint_rate ?? ""} disabled={!canEdit} onBlur={(e) => num(e.target.value) !== a.complaint_rate && m.mutate({ ...base, complaint_rate: num(e.target.value) })} /></TableCell>
                  <TableCell className="text-sm">{a["production_access"] == null ? "—" : a["production_access"] ? "Production" : "Sandbox"}</TableCell>
                  <TableCell>{bad ? <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Over limit</Badge> : <Badge variant="outline">{a.pool_status}</Badge>}</TableCell>
                </TableRow>
              );
            })}
            {!accounts.length && <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No Amazon SES accounts yet — add them on the Delivery Servers page.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}

function Simulator({ accounts, vipClients, thresholds }: { accounts: RoutableAccount[]; vipClients: { id: string; company: string; ses_account_id: string | null; backup_account_id: string | null }[]; thresholds: { bounce: number; complaint: number } }) {
  const [client, setClient] = useState(STANDARD);
  const [volume, setVolume] = useState(10000);
  const vip = vipClients.find((v) => v.id === client) ?? null;
  const r = planRoute(accounts, { volume, vipClient: vip }, thresholds);
  return (
    <Panel className="space-y-4 p-4">
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1.5"><Label>Campaign for</Label>
          <Select value={client} onValueChange={setClient}>
            <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={STANDARD}>Standard campaign</SelectItem>{vipClients.map((v) => <SelectItem key={v.id} value={v.id}>VIP · {v.company}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Volume</Label><Input type="number" min={1} className="w-36" value={volume} onChange={(e) => setVolume(Number(e.target.value) || 0)} /></div>
      </div>
      <div className={`rounded-md border p-3 text-sm ${r.enough ? "" : "border-destructive text-destructive"}`}>
        {r.plan.length === 0 ? "No account can carry this campaign right now." : r.enough ? `Enough capacity${r.capacity != null ? ` (${r.capacity.toLocaleString()} available today)` : ""}.` : `Only ${r.capacity?.toLocaleString()} messages of capacity today — ${(volume - (r.capacity ?? 0)).toLocaleString()} would wait until tomorrow.`}
      </div>
      <ol className="space-y-1 text-sm">{r.plan.map((s, i) => <li key={s.account.id}>{i + 1}. <span className="font-medium">{s.account.name}</span> <span className="text-muted-foreground">· {s.role} · {s.remaining == null ? "quota unknown" : `${s.remaining.toLocaleString()} left`}</span></li>)}</ol>
      {!!r.rejected.length && <div className="text-sm"><h3 className="font-semibold">Skipped</h3>{r.rejected.map((x) => <p key={x.account.id} className="text-muted-foreground">{x.account.name} — {x.reason}</p>)}</div>}
    </Panel>
  );
}

function Limits({ bounce, complaint, canEdit, onSaved }: { bounce: number; complaint: number; canEdit: boolean; onSaved: () => void }) {
  const save = useServerFn(saveThresholds);
  const [b, setB] = useState(bounce);
  const [c, setC] = useState(complaint);
  const m = useMutation({ mutationFn: () => save({ data: { bounce: b, complaint: c } }), onSuccess: () => { toast.success("Limits saved"); onSaved(); }, onError: (e) => toast.error((e as Error).message) });
  return (
    <Panel className="max-w-md space-y-3 p-4">
      <p className="text-sm text-muted-foreground">An account at or above either limit is taken out of routing. AWS reviews accounts around 5% bounces and 0.1% complaints.</p>
      <div className="space-y-1.5"><Label>Bounce limit (%)</Label><Input type="number" step="0.1" value={b} disabled={!canEdit} onChange={(e) => setB(Number(e.target.value))} /></div>
      <div className="space-y-1.5"><Label>Complaint limit (%)</Label><Input type="number" step="0.01" value={c} disabled={!canEdit} onChange={(e) => setC(Number(e.target.value))} /></div>
      {canEdit && <Button onClick={() => m.mutate()} disabled={m.isPending}>Save limits</Button>}
    </Panel>
  );
}
