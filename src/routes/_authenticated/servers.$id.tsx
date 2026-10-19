import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Copy, KeyRound, RefreshCw, Terminal, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PortBadge, serverState } from "@/components/server-bits";
import { useMe } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { COMMANDS, parseConfig, type CommandKind, type ServerConfig } from "@/lib/kumo-config";
import { getInstallCommand, queueCommands, rotateToken, updateServer } from "@/lib/servers.functions";
import { listSesAccounts } from "@/lib/ses.functions";

export const Route = createFileRoute("/_authenticated/servers/$id")({
  head: () => ({ meta: [
    { title: "KumoMTA server — Cortex" }, { name: "description", content: "System, ports, KumoMTA configuration and remote commands for one server." },
    { property: "og:title", content: "KumoMTA server — Cortex" }, { property: "og:description", content: "Control a KumoMTA server from Cortex." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ServerPage,
});

type Probe = { ok: boolean; banner?: string; error?: string };

function ServerPage() {
  const { id } = Route.useParams(); const qc = useQueryClient(); const navigate = useNavigate(); const { data: me } = useMe();
  const s = useQuery({ queryKey: ["mta_servers", id], refetchInterval: 10000, queryFn: async () => { const { data, error } = await supabase.from("mta_servers").select("*").eq("id", id).maybeSingle(); if (error) throw error; return data; } });
  const cmds = useQuery({ queryKey: ["server_commands", id], refetchInterval: 5000, queryFn: async () => { const { data, error } = await supabase.from("server_commands").select("*").eq("server_id", id).order("created_at", { ascending: false }).limit(30); if (error) throw error; return data; } });
  const sesFn = useServerFn(listSesAccounts); const ses = useQuery({ queryKey: ["ses-accounts"], queryFn: () => sesFn() });
  const queueFn = useServerFn(queueCommands); const saveFn = useServerFn(updateServer); const installFn = useServerFn(getInstallCommand); const rotateFn = useServerFn(rotateToken);
  const [form, setForm] = useState<{ name: string; pool: string; hostname: string; paused: boolean; ses: string; cfg: ServerConfig } | null>(null);
  const [shell, setShell] = useState(""); const [port, setPort] = useState("25"); const [install, setInstall] = useState("");
  useEffect(() => { if (s.data && !form) setForm({ name: s.data.name, pool: s.data.pool, hostname: s.data.hostname ?? "", paused: s.data.paused, ses: s.data.ses_account_id ?? "none", cfg: parseConfig(s.data.config) }); }, [s.data, form]);

  if (s.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!s.data) return <p className="text-muted-foreground">Server not found.</p>;
  const srv = s.data; const st = serverState(srv); const sys = (srv.system ?? {}) as Record<string, unknown>; const ports = (srv.ports ?? {}) as Record<string, Probe | string[] | string | number>;
  const canExec = !!me?.can("servers", "execute"); const canEdit = !!me?.can("servers", "edit"); const isSuper = !!me?.roles.includes("super_admin");

  async function run(kind: CommandKind, payload: Record<string, string | number> = {}) {
    if (COMMANDS[kind].danger && !confirm(`${COMMANDS[kind].label}?`)) return;
    try { await queueFn({ data: { ids: [id], kind, payload } }); toast.success("Queued — runs within 10 seconds"); cmds.refetch(); } catch (e) { toast.error((e as Error).message); }
  }
  async function save(apply: boolean) {
    if (!form) return;
    try {
      await saveFn({ data: { id, name: form.name, pool: form.pool, hostname: form.hostname, paused: form.paused, ses_account_id: form.ses === "none" ? null : form.ses, config: form.cfg } });
      toast.success("Saved"); qc.invalidateQueries({ queryKey: ["mta_servers"] });
      if (apply) await run("apply_config");
    } catch (e) { toast.error((e as Error).message); }
  }
  async function remove() {
    if (!confirm(`Delete ${srv.name}? The agent will stop working.`)) return;
    const { error } = await supabase.from("mta_servers").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["mta_servers"] }); navigate({ to: "/servers" });
  }
  const probes: [string, string][] = [["outbound_25_gmail", "Outbound 25 → Gmail"], ["outbound_25_outlook", "Outbound 25 → Outlook"], ["outbound_587_ses", "Outbound 587 → SES"], ["outbound_465_ses", "Outbound 465 → SES"]];

  return (
    <div>
      <Link to="/servers" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" />Delivery servers</Link>
      <PageHeader title={srv.name} subtitle={`${srv.ip} · pool ${srv.pool}`} actions={<><Badge variant={st.tone}>{st.label}</Badge><Button size="icon" variant="outline" aria-label="Refresh server" onClick={() => { s.refetch(); cmds.refetch(); }}><RefreshCw className="h-4 w-4" /></Button>{me?.can("servers", "delete") && <Button size="sm" variant="ghost" className="text-destructive" onClick={remove}><Trash2 className="h-4 w-4" />Delete</Button>}</>} />
      {srv.last_error && <p className="mb-4 border-y py-2 text-xs text-destructive">Last error: {srv.last_error}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="System">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 p-4 text-sm">
            {([["OS", sys["os"]], ["Kernel", sys["kernel"]], ["Hostname", sys["hostname"]], ["Public IP", sys["public_ip"]], ["PTR / rDNS", sys["ptr"] || "none"], ["CPU", sys["cpus"]], ["RAM", sys["mem_mb"] ? `${Math.round(Number(sys["mem_free_mb"]) / 1024)} / ${Math.round(Number(sys["mem_mb"]) / 1024)} GB free` : null], ["Disk", sys["disk_gb"] ? `${sys["disk_free_gb"]} / ${sys["disk_gb"]} GB free` : null], ["Load", Array.isArray(sys["load"]) ? (sys["load"] as number[]).join(" · ") : null], ["Uptime", sys["uptime_s"] ? `${Math.round(Number(sys["uptime_s"]) / 3600)} h` : null], ["KumoMTA", srv.kumo_installed ? (srv.kumo_active ? "active" : "stopped") : "not installed"], ["Version", srv.kumo_version], ["Agent", sys["agent_version"]], ["Last seen", fmtDate(srv.last_seen_at)]] as [string, unknown][]).map(([k, v]) => <div key={k} className="contents"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="break-all text-xs">{v ? String(v) : "—"}</dd></div>)}
          </dl>
          {srv.hostname && sys["ptr"] !== undefined && sys["ptr"] !== srv.hostname && <p className="px-4 pb-4 text-xs text-warning-foreground dark:text-warning">rDNS ({String(sys["ptr"] || "none")}) does not match hostname {srv.hostname}. Set it in Domains & DNS → Sending IPs & rDNS.</p>}
        </Panel>
        <Panel title="Ports & network" action={canExec && <Button size="sm" variant="outline" onClick={() => run("check_ports")}>Re-check</Button>}>
          <ul className="space-y-2 p-4 text-sm">{probes.map(([k, label]) => { const p = ports[k] as Probe | undefined; return <li key={k} className="flex items-center justify-between gap-2"><span className="text-xs">{label}</span><span className="text-right"><PortBadge ok={p?.ok} label={p?.ok ? "open" : p ? "blocked" : "unknown"} />{p?.banner && <span className="block max-w-48 truncate text-[10px] text-muted-foreground">{p.banner}</span>}</span></li>; })}</ul>
          {(ports["outbound_25_gmail"] as Probe | undefined)?.ok === false && <p className="px-4 pb-3 text-xs text-warning-foreground dark:text-warning">Outbound port 25 is blocked. On AWS EC2, submit the “Request to remove email sending limitations” form; on Hetzner/OVH/DigitalOcean/Vultr open a support ticket — or link an SES relay below (port 587).</p>}
          <div className="border-t p-4"><p className="mb-1 text-xs text-muted-foreground">Listening ports</p><p className="break-all font-mono text-[11px]">{Array.isArray(ports["listening"]) ? (ports["listening"] as string[]).join("  ") : "—"}</p>
            <p className="mb-1 mt-3 text-xs text-muted-foreground">Firewall</p><pre className="max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{typeof ports["firewall"] === "string" ? ports["firewall"] : "—"}</pre>
            {canExec && <div className="mt-3 flex gap-2"><Input className="h-8 w-24" value={port} onChange={(e) => setPort(e.target.value)} aria-label="Port to open" /><Button size="sm" variant="outline" onClick={() => run("open_port", { port: Number(port) })}>Open port</Button></div>}
          </div>
        </Panel>
        <Panel title="Control">
          <div className="flex flex-wrap gap-2 p-4">{canExec && (["install_kumomta", "apply_config", "start_kumomta", "restart_kumomta", "stop_kumomta", "queue_summary", "tail_logs", "system_info", "update_agent"] as CommandKind[]).map((k) => <Button key={k} size="sm" variant={k === "stop_kumomta" ? "destructive" : k === "install_kumomta" ? "secondary" : "outline"} onClick={() => run(k)}>{COMMANDS[k].label}</Button>)}</div>
          {isSuper && <div className="flex gap-2 border-t p-4"><Input className="font-mono text-xs" placeholder="Shell command, e.g. df -h" value={shell} onChange={(e) => setShell(e.target.value)} onKeyDown={(e) => e.key === "Enter" && shell.trim() && run("shell", { command: shell })} /><Button size="sm" variant="destructive" disabled={!shell.trim()} onClick={() => run("shell", { command: shell })}><Terminal className="h-4 w-4" />Run</Button></div>}
          {canEdit && <div className="flex flex-wrap gap-2 border-t p-4">
            <Button size="sm" variant="outline" onClick={async () => { try { setInstall((await installFn({ data: { ids: [id] } }))[0]?.command ?? ""); } catch (e) { toast.error((e as Error).message); } }}><Copy className="h-4 w-4" />Install command</Button>
            <Button size="sm" variant="outline" onClick={async () => { if (!confirm("Revoke the current token? The agent must be reinstalled with the new command.")) return; try { setInstall((await rotateFn({ data: { id } })).command); } catch (e) { toast.error((e as Error).message); } }}><KeyRound className="h-4 w-4" />Rotate token</Button>
          </div>}
          {install && <pre className="mx-4 mb-4 whitespace-pre-wrap break-all bg-muted p-2 font-mono text-[11px]">{install}</pre>}
        </Panel>
      </div>

      {form && canEdit && <Panel title="KumoMTA configuration" className="mt-4">
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <F label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></F>
          <F label="Pool"><Input value={form.pool} onChange={(e) => setForm({ ...form, pool: e.target.value })} /></F>
          <F label="Hostname (EHLO)"><Input value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} placeholder="mta1.example.com" /></F>
          <F label="Amazon SES relay"><Select value={form.ses} onValueChange={(v) => setForm({ ...form, ses: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Direct delivery (port 25)</SelectItem>{ses.data?.map((a) => <SelectItem key={a.id} value={a.id}>Relay via {a.name} (587)</SelectItem>)}</SelectContent></Select></F>
          <F label="Max connections per destination"><Input type="number" value={form.cfg.max_connections} onChange={(e) => setForm({ ...form, cfg: { ...form.cfg, max_connections: Number(e.target.value) } })} /></F>
          <F label="Max message rate per destination"><Input value={form.cfg.max_message_rate} onChange={(e) => setForm({ ...form, cfg: { ...form.cfg, max_message_rate: e.target.value } })} placeholder="300/min" /></F>
          <F label="TLS"><Select value={form.cfg.enable_tls} onValueChange={(v) => setForm({ ...form, cfg: { ...form.cfg, enable_tls: v as ServerConfig["enable_tls"] } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="OpportunisticInsecure">Opportunistic (accept any cert)</SelectItem><SelectItem value="Opportunistic">Opportunistic (valid cert)</SelectItem><SelectItem value="Required">Required</SelectItem></SelectContent></Select></F>
          <div className="space-y-3"><label className="flex items-center gap-2 text-sm"><Switch checked={form.cfg.sending} onCheckedChange={(v) => setForm({ ...form, cfg: { ...form.cfg, sending: v } })} />Takes campaign traffic</label><label className="flex items-center gap-2 text-sm"><Switch checked={form.paused} onCheckedChange={(v) => setForm({ ...form, paused: v })} />Paused</label></div>
        </div>
        <div className="flex gap-2 border-t p-4"><Button variant="outline" onClick={() => save(false)}>Save</Button>{canExec && <Button onClick={() => save(true)}>Save and apply to server</Button>}</div>
      </Panel>}

      <Panel title="Command history" className="mt-4">
        <ul className="divide-y">{!cmds.data?.length && <li className="p-4 text-sm text-muted-foreground">No commands yet.</li>}
          {cmds.data?.map((c) => <li key={c.id} className="p-3 text-sm"><details><summary className="flex cursor-pointer flex-wrap items-center gap-3"><Badge variant={c.status === "done" ? "default" : c.status === "failed" ? "destructive" : "outline"}>{c.status}</Badge><span>{COMMANDS[c.kind as CommandKind]?.label ?? c.kind}{c.kind === "shell" ? `: ${(c.payload as { command?: string })?.command ?? ""}` : ""}</span><span className="text-xs text-muted-foreground">{fmtDate(c.created_at)}</span></summary>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all bg-muted p-2 font-mono text-[11px]">{c.output || (c.status === "queued" ? "Waiting for the agent…" : c.status === "sent" || c.status === "running" ? "Running…" : "")}</pre></details></li>)}
        </ul>
      </Panel>
    </div>
  );
}
function F({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>; }
