import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Plus, Play, RefreshCw, Server, Terminal, Cloud } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMe } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { COMMANDS, parseBulkServers, type CommandKind } from "@/lib/kumo-config";
import { addServers, getInstallCommand, queueCommands } from "@/lib/servers.functions";
import { SesPanel } from "@/components/ses-panel";
import { PortBadge, serverState } from "@/components/server-bits";

export const Route = createFileRoute("/_authenticated/servers/")({
  head: () => ({ meta: [
    { title: "Delivery servers — Cortex" }, { name: "description", content: "Install and control KumoMTA servers and Amazon SES from Cortex." },
    { property: "og:title", content: "Delivery servers — Cortex" }, { property: "og:description", content: "KumoMTA VPS fleet, ports, queue and Amazon SES control." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ServersPage,
});

type Ports = { outbound_25_gmail?: { ok: boolean }; outbound_587_ses?: { ok: boolean } };

function ServersPage() {
  const { data: me } = useMe();
  return (
    <div>
      <PageHeader title="Delivery servers" subtitle="KumoMTA servers installed and controlled from Cortex, plus Amazon SES." />
      <Tabs defaultValue="servers">
        <TabsList><TabsTrigger value="servers"><Server className="mr-1 h-3.5 w-3.5" />KumoMTA servers</TabsTrigger><TabsTrigger value="ses"><Cloud className="mr-1 h-3.5 w-3.5" />Amazon SES</TabsTrigger></TabsList>
        <TabsContent value="servers"><ServerList canCreate={!!me?.can("servers", "create")} canExec={!!me?.can("servers", "execute")} isSuper={!!me?.roles.includes("super_admin")} /></TabsContent>
        <TabsContent value="ses"><SesPanel canEdit={!!me?.can("servers", "edit")} canCreate={!!me?.can("servers", "create")} /></TabsContent>
      </Tabs>
    </div>
  );
}

function ServerList({ canCreate, canExec, isSuper }: { canCreate: boolean; canExec: boolean; isSuper: boolean }) {
  const qc = useQueryClient();
  const servers = useQuery({ queryKey: ["mta_servers"], refetchInterval: 10000, queryFn: async () => {
    const { data, error } = await supabase.from("mta_servers").select("id,name,ip,hostname,pool,last_seen_at,kumo_installed,kumo_active,kumo_version,paused,system,ports,last_error").order("created_at");
    if (error) throw error; return data;
  } });
  const [sel, setSel] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [cmds, setCmds] = useState<{ name: string; ip: string; command: string }[] | null>(null);
  const [shell, setShell] = useState("");
  const [pool, setPool] = useState("all");
  const queueFn = useServerFn(queueCommands); const installFn = useServerFn(getInstallCommand);
  const rows = useMemo(() => (servers.data ?? []).filter((s) => pool === "all" || s.pool === pool), [servers.data, pool]);
  const pools = [...new Set((servers.data ?? []).map((s) => s.pool))];
  const online = (servers.data ?? []).filter((s) => serverState(s).label === "Online").length;

  async function run(kind: CommandKind, payload: Record<string, string | number> = {}) {
    if (!sel.length) { toast.error("Select at least one server"); return; }
    if (COMMANDS[kind].danger && !confirm(`${COMMANDS[kind].label} on ${sel.length} server(s)?`)) return;
    try { const r = await queueFn({ data: { ids: sel, kind, payload } }); toast.success(`${r.queued} command(s) queued — agents run them within 10 seconds`); qc.invalidateQueries({ queryKey: ["server_commands"] }); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function showInstall() {
    if (!sel.length) { toast.error("Select at least one server"); return; }
    try { setCmds(await installFn({ data: { ids: sel } })); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 border-y py-4 sm:grid-cols-4">
        <Stat label="Servers" value={servers.data?.length ?? 0} /><Stat label="Online" value={online} /><Stat label="Pools" value={pools.length} />
        <Stat label="Port 25 open" value={(servers.data ?? []).filter((s) => (s.ports as Ports)?.outbound_25_gmail?.ok).length} />
      </div>
      <Panel title="Servers" action={<div className="flex flex-wrap gap-2">
        <Select value={pool} onValueChange={setPool}><SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All pools</SelectItem>{pools.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
        <Button size="sm" variant="outline" aria-label="Refresh servers" onClick={() => servers.refetch()}><RefreshCw className="h-4 w-4" /></Button>
        {canCreate && <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" />Add servers</Button>}
      </div>}>
        {canExec && <div className="flex flex-wrap items-center gap-2 border-b p-3 text-xs">
          <span className="text-muted-foreground">{sel.length} selected</span>
          <Button size="sm" variant="secondary" onClick={() => run("install_kumomta")}><Play className="h-3.5 w-3.5" />Install KumoMTA</Button>
          <Button size="sm" variant="outline" onClick={() => run("apply_config")}>Apply config</Button>
          <Button size="sm" variant="outline" onClick={() => run("restart_kumomta")}>Restart</Button>
          <Button size="sm" variant="outline" onClick={() => run("check_ports")}>Check ports</Button>
          <Button size="sm" variant="outline" onClick={() => run("system_info")}>Refresh info</Button>
          <Button size="sm" variant="outline" onClick={() => run("update_agent")}>Update agent</Button>
          <Button size="sm" variant="outline" onClick={showInstall}><Copy className="h-3.5 w-3.5" />Install commands</Button>
          {isSuper && <div className="flex gap-1"><Input className="h-8 w-56 font-mono text-xs" placeholder="Shell command (Super Admin)" value={shell} onChange={(e) => setShell(e.target.value)} /><Button size="sm" variant="destructive" disabled={!shell.trim()} onClick={() => run("shell", { command: shell })}><Terminal className="h-3.5 w-3.5" />Run</Button></div>}
        </div>}
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-8"><Checkbox aria-label="Select all servers" checked={rows.length > 0 && sel.length === rows.length} onCheckedChange={(v) => setSel(v ? rows.map((r) => r.id) : [])} /></TableHead>
            <TableHead>Server</TableHead><TableHead>Pool</TableHead><TableHead>Status</TableHead><TableHead className="hidden md:table-cell">System</TableHead><TableHead>Ports</TableHead><TableHead className="hidden lg:table-cell">Last seen</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {!rows.length && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No servers yet. Click “Add servers”, then run the install command on each VPS as root.</TableCell></TableRow>}
            {rows.map((s) => { const st = serverState(s); const sys = (s.system ?? {}) as Record<string, string | number>; const ports = (s.ports ?? {}) as Ports; return (
              <TableRow key={s.id}>
                <TableCell><Checkbox aria-label={`Select ${s.name}`} checked={sel.includes(s.id)} onCheckedChange={(v) => setSel(v ? [...sel, s.id] : sel.filter((x) => x !== s.id))} /></TableCell>
                <TableCell><Link to="/servers/$id" params={{ id: s.id }} className="font-medium hover:underline">{s.name}</Link><p className="font-mono text-xs text-muted-foreground">{s.ip}{sys["ptr"] ? ` · ${sys["ptr"]}` : ""}</p></TableCell>
                <TableCell className="text-xs">{s.pool}</TableCell>
                <TableCell><Badge variant={st.tone}>{st.label}</Badge>{s.kumo_version && <p className="mt-1 text-[11px] text-muted-foreground">{s.kumo_version}</p>}</TableCell>
                <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{sys["os"] ? <>{sys["os"]}<br />{sys["cpus"]} CPU · {Math.round(Number(sys["mem_mb"]) / 1024)} GB RAM · {sys["disk_free_gb"]} GB free</> : "—"}</TableCell>
                <TableCell><div className="flex flex-col"><PortBadge ok={ports.outbound_25_gmail?.ok} label="25 out" /><PortBadge ok={ports.outbound_587_ses?.ok} label="587 SES" /></div></TableCell>
                <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{fmtDate(s.last_seen_at)}</TableCell>
              </TableRow>); })}
          </TableBody>
        </Table>
      </Panel>
      <p className="text-xs text-muted-foreground">Each VPS runs a small Cortex agent that polls this site every 10 seconds: no SSH key or open inbound port is needed. Supported systems: Ubuntu 20.04/22.04, Rocky/Alma 8–9, Amazon Linux. Many hosts block outbound port 25 by default — ask your provider (or AWS) to unblock it, or link the server to Amazon SES to relay through port 587.</p>
      <AddDialog open={addOpen} onOpenChange={setAddOpen} onDone={(c) => { setCmds(c); qc.invalidateQueries({ queryKey: ["mta_servers"] }); }} />
      <Dialog open={!!cmds} onOpenChange={(o) => !o && setCmds(null)}>
        <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Install commands</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Run as root on each VPS. Each command contains that server's private token — do not share it.</p>
          <div className="max-h-[50vh] space-y-3 overflow-auto">{cmds?.map((c) => <div key={c.ip}><p className="text-xs font-medium">{c.name} · {c.ip}</p><pre className="whitespace-pre-wrap break-all bg-muted p-2 font-mono text-[11px]">{c.command}</pre></div>)}</div>
          {cmds && cmds.length > 1 && <details><summary className="cursor-pointer text-xs">Bulk install over SSH from your computer</summary><pre className="mt-2 whitespace-pre-wrap break-all bg-muted p-2 font-mono text-[11px]">{cmds.map((c) => `ssh root@${c.ip} "${c.command.replace(/"/g, '\\"')}"`).join("\n")}</pre></details>}
          <DialogFooter><Button variant="outline" onClick={() => { navigator.clipboard.writeText(cmds?.map((c) => c.command).join("\n") ?? ""); toast.success("Copied"); }}><Copy className="h-4 w-4" />Copy all</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div><p className="text-[11px] uppercase text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></div>;
}

function AddDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: (c: { name: string; ip: string; command: string }[]) => void }) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [name, setName] = useState(""); const [ip, setIp] = useState(""); const [hostname, setHostname] = useState(""); const [pool, setPool] = useState("default");
  const [bulk, setBulk] = useState(""); const [install, setInstall] = useState(true); const [busy, setBusy] = useState(false);
  const addFn = useServerFn(addServers);
  const parsed = parseBulkServers(bulk);
  async function submit() {
    const list = mode === "single" ? [{ name: name || ip, ip, pool, hostname }] : parsed.filter((p) => p.valid).map((p) => ({ name: p.name, ip: p.ip, pool: p.pool }));
    if (!list.length || list.some((s) => !s.ip)) { toast.error("Enter at least one valid IP"); return; }
    setBusy(true);
    try { const r = await addFn({ data: { servers: list, install } }); onOpenChange(false); onDone(r); setBulk(""); setIp(""); setName(""); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Add KumoMTA servers</DialogTitle></DialogHeader>
      <Tabs value={mode} onValueChange={(v) => setMode(v as "single" | "bulk")}><TabsList><TabsTrigger value="single">Single</TabsTrigger><TabsTrigger value="bulk">Bulk</TabsTrigger></TabsList>
        <TabsContent value="single" className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label className="text-xs">IP address</Label><Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="203.0.113.10" /></div>
          <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mta-01" /></div>
          <div className="space-y-1"><Label className="text-xs">Hostname (EHLO / rDNS)</Label><Input value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="mta1.example.com" /></div>
          <div className="space-y-1"><Label className="text-xs">Pool</Label><Input value={pool} onChange={(e) => setPool(e.target.value)} /></div>
        </TabsContent>
        <TabsContent value="bulk" className="space-y-2">
          <Label className="text-xs">One server per line: <span className="font-mono">name, ip, pool</span> (or just an IP)</Label>
          <Textarea rows={8} className="font-mono text-xs" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"mta-01, 203.0.113.10, warmup\nmta-02, 203.0.113.11, warmup\n203.0.113.12"} />
          <p className="text-xs text-muted-foreground">{parsed.filter((p) => p.valid).length} valid · {parsed.filter((p) => !p.valid).length} invalid</p>
        </TabsContent>
      </Tabs>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={install} onCheckedChange={(v) => setInstall(!!v)} />Install KumoMTA automatically when the agent connects</label>
      <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy} onClick={submit}>Add and get install commands</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

