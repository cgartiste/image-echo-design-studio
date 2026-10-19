import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, ShieldCheck, Trash2, Wand2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, StatusBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TemplateDialog } from "@/components/dns-template-dialog";
import { checkDomains, checkRdns, deleteAccount, listAccounts, saveAccount, setRdns, syncAccount, testAccount } from "@/lib/dns.functions";
import { PROVIDERS } from "@/lib/provider-meta";
import { CHECK_WEIGHTS, type CheckKey, type DomainChecks } from "@/lib/dns-records";
import { fmtDate, fmtNum } from "@/lib/format";
import { useMe } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/domains/")({
  head: () => ({ meta: [{ title: "Domains & DNS — Cortex" }, { name: "description", content: "SPF, DKIM, DMARC, rDNS and DNS records across providers." }] }),
  component: DomainsPage,
});

const CHECK_LABELS: Record<CheckKey, string> = { spf: "SPF", dkim: "DKIM", dmarc: "DMARC", mx: "MX", mta_sts: "MTA-STS", tls_rpt: "TLS-RPT", bimi: "BIMI", return_path: "Bounce" };
const PAGE = 50;

async function inBatches<T>(items: T[], size: number, fn: (b: T[]) => Promise<unknown>, onProgress: (p: number) => void) {
  for (let i = 0; i < items.length; i += size) {
    await fn(items.slice(i, i + size));
    onProgress(Math.round((Math.min(i + size, items.length) / items.length) * 100));
  }
}

function DomainsPage() {
  return (
    <div>
      <PageHeader title="Domains & DNS" subtitle="SPF, DKIM, DMARC, MTA-STS, TLS-RPT, BIMI, bounce domains and reverse DNS, managed through your provider accounts." />
      <Tabs defaultValue="domains">
        <TabsList>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          <TabsTrigger value="ips">Sending IPs & rDNS</TabsTrigger>
          <TabsTrigger value="accounts">Provider accounts</TabsTrigger>
        </TabsList>
        <TabsContent value="domains"><DomainsTab /></TabsContent>
        <TabsContent value="ips"><IpsTab /></TabsContent>
        <TabsContent value="accounts"><AccountsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function useAccounts() {
  const fn = useServerFn(listAccounts);
  return useQuery({ queryKey: ["provider_accounts"], queryFn: () => fn() });
}

function DomainsTab() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const accounts = useAccounts();
  const check = useServerFn(checkDomains);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [acc, setAcc] = useState("all");
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<number | null>(null);
  const [bulkAdd, setBulkAdd] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [tpl, setTpl] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["domains"],
    queryFn: async () => {
      const out: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from("domains").select("id,name,provider,account_id,status,score,checks,last_checked_at").order("name").range(from, from + 999);
        out.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return out as { id: string; name: string; provider: string | null; account_id: string | null; status: string; score: number; checks: DomainChecks; last_checked_at: string | null }[];
    },
  });
  const filtered = useMemo(() => data.filter((d) => (status === "all" || d.status === status) && (acc === "all" || d.account_id === acc) && (!q || d.name.includes(q.toLowerCase()))), [data, q, status, acc]);
  const rows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const accName = (id: string | null) => accounts.data?.find((a) => a.id === id)?.name ?? "—";
  const stats = { total: data.length, verified: data.filter((d) => d.status === "verified").length, action: data.filter((d) => d.status === "action_required").length, pending: data.filter((d) => d.status === "pending").length };

  async function runChecks(ids: string[]) {
    if (!ids.length) return;
    setProgress(0);
    try {
      await inBatches(ids, 20, (b) => check({ data: { ids: b } }), setProgress);
      toast.success(`Checked ${fmtNum(ids.length)} domains`);
    } catch (e) { toast.error((e as Error).message); }
    setProgress(null);
    qc.invalidateQueries({ queryKey: ["domains"] });
  }
  async function addBulk() {
    const names = [...new Set(bulkText.split(/[\s,;]+/).map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter((s) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)))];
    if (!names.length) { toast.error("No valid domains found"); return; }
    for (let i = 0; i < names.length; i += 500) {
      const { error } = await supabase.from("domains").upsert(names.slice(i, i + 500).map((name) => ({ name })), { onConflict: "name", ignoreDuplicates: true });
      if (error) { toast.error(error.message); return; }
    }
    toast.success(`${names.length} domains added`);
    setBulkAdd(false); setBulkText("");
    qc.invalidateQueries({ queryKey: ["domains"] });
  }
  async function removeSelected() {
    if (!confirm(`Remove ${sel.size} domains from Cortex? DNS records at the provider are not touched.`)) return;
    await supabase.from("domains").delete().in("id", [...sel]);
    setSel(new Set());
    qc.invalidateQueries({ queryKey: ["domains"] });
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
        {[["Domains", stats.total], ["Verified", stats.verified], ["Action required", stats.action], ["Not checked", stats.pending]].map(([l, v]) => (
          <div key={l} className="bg-card p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{l}</p><p className="kpi-value text-xl font-semibold">{fmtNum(v as number)}</p></div>
        ))}
      </div>
      {progress !== null && <Panel className="mb-4 p-3"><p className="mb-2 text-sm">Working… {progress}%</p><Progress value={progress} /></Panel>}
      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Input placeholder="Search domains…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="h-9 w-full sm:w-60" />
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{["all", "verified", "action_required", "pending"].map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s.replace("_", " ")}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={acc} onValueChange={(v) => { setAcc(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {(accounts.data ?? []).filter((a) => PROVIDERS[a.provider]?.kind === "dns").map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto flex flex-wrap gap-2">
            {me?.can("lists", "view") && <Button size="sm" variant="outline" onClick={() => setBulkAdd(true)}><Plus className="h-3.5 w-3.5" /> Add domains</Button>}
            <Button size="sm" variant="outline" disabled={progress !== null} onClick={() => runChecks(filtered.map((d) => d.id))}><ShieldCheck className="h-3.5 w-3.5" /> Check {filtered.length === data.length ? "all" : "filtered"} ({fmtNum(filtered.length)})</Button>
          </div>
        </div>
        {sel.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-accent px-3 py-2 text-xs">
            <span className="font-medium">{sel.size} selected</span>
            <Button size="sm" variant="ghost" onClick={() => runChecks([...sel])}><ShieldCheck className="h-3.5 w-3.5" /> Check</Button>
            <Button size="sm" variant="ghost" onClick={() => setTpl(true)}><Wand2 className="h-3.5 w-3.5" /> Publish SPF/DKIM/DMARC…</Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={removeSelected}><Trash2 className="h-3.5 w-3.5" /> Remove</Button>
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"><Checkbox checked={rows.length > 0 && rows.every((r) => sel.has(r.id))} onCheckedChange={(v) => setSel((s) => { const n = new Set(s); rows.forEach((r) => (v ? n.add(r.id) : n.delete(r.id))); return n; })} /></TableHead>
                <TableHead>Domain</TableHead>
                <TableHead className="hidden md:table-cell">Account</TableHead>
                <TableHead>Records</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No domains yet. Add a provider account and sync, or add domains manually.</TableCell></TableRow>}
              {rows.map((d) => (
                <TableRow key={d.id}>
                  <TableCell><Checkbox checked={sel.has(d.id)} onCheckedChange={(v) => setSel((p) => { const n = new Set(p); v ? n.add(d.id) : n.delete(d.id); return n; })} /></TableCell>
                  <TableCell><Link to="/domains/$id" params={{ id: d.id }} className="font-mono text-sm hover:text-primary">{d.name}</Link></TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{d.provider ? `${PROVIDERS[d.provider]?.label} · ${accName(d.account_id)}` : "Manual"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(Object.keys(CHECK_WEIGHTS) as CheckKey[]).map((k) => {
                        const c = d.checks?.[k];
                        return <span key={k} title={c?.issue ?? c?.value ?? "Not checked"} className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${!c ? "bg-muted text-muted-foreground" : c.ok ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>{CHECK_LABELS[k]}</span>;
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{d.score}</TableCell>
                  <TableCell><StatusBadge status={d.status === "verified" ? "completed" : d.status === "pending" ? "draft" : "failed"} className="normal-case" /><span className="sr-only">{d.status}</span></TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{fmtDate(d.last_checked_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <span>{fmtNum(filtered.length)} domains · page {page + 1} of {pages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      </Panel>
      <Dialog open={bulkAdd} onOpenChange={setBulkAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add domains</DialogTitle></DialogHeader>
          <Textarea rows={10} placeholder={"example.com\nmail.example.org"} value={bulkText} onChange={(e) => setBulkText(e.target.value)} className="font-mono text-xs" />
          <p className="text-xs text-muted-foreground">One per line, or separated by commas. To edit records, sync them from a provider account instead.</p>
          <DialogFooter><Button onClick={addBulk}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <TemplateDialog open={tpl} onOpenChange={setTpl} domainIds={[...sel]} onDone={() => runChecks([...sel])} />
    </>
  );
}

function AccountsTab() {
  const qc = useQueryClient();
  const accounts = useAccounts();
  const save = useServerFn(saveAccount);
  const test = useServerFn(testAccount);
  const sync = useServerFn(syncAccount);
  const del = useServerFn(deleteAccount);
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState("cloudflare");
  const [name, setName] = useState("");
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["provider_accounts"] });

  async function submit() {
    try {
      const { id } = await save({ data: { name, provider, creds } });
      toast.success("Account saved, testing connection…");
      setOpen(false); setName(""); setCreds({});
      const r = await test({ data: { id } });
      r.ok ? toast.success(r.message) : toast.error(r.message);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function act(id: string, kind: "test" | "sync") {
    setBusy(id + kind);
    try {
      if (kind === "test") { const r = await test({ data: { id } }); r.ok ? toast.success(r.message) : toast.error(r.message); }
      else { const r = await sync({ data: { id } }); toast.success(`${fmtNum(r.count)} domains synced`); qc.invalidateQueries({ queryKey: ["domains"] }); }
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null); refresh();
  }
  const meta = PROVIDERS[provider]!;

  return (
    <Panel title="Provider accounts" action={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Add account</Button>}>
      <p className="border-b px-4 py-2 text-xs text-muted-foreground">Keys are encrypted and never sent back to the browser. Add as many accounts per provider as you need.</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Provider</TableHead><TableHead>Used for</TableHead><TableHead>Status</TableHead><TableHead className="hidden md:table-cell">Last sync</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {(accounts.data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No accounts yet.</TableCell></TableRow>}
            {(accounts.data ?? []).map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell>{PROVIDERS[a.provider]?.label}</TableCell>
                <TableCell className="text-xs">{PROVIDERS[a.provider]?.kind === "dns" ? "DNS records" : "Reverse DNS"}</TableCell>
                <TableCell><StatusBadge status={a.status === "connected" ? "active" : a.status === "error" ? "failed" : "draft"} />{a.last_error && <p className="mt-1 max-w-xs truncate text-[11px] text-destructive" title={a.last_error}>{a.last_error}</p>}</TableCell>
                <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{fmtDate(a.last_sync_at)}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act(a.id, "test")}><Zap className="h-3.5 w-3.5" /> Test</Button>
                  {PROVIDERS[a.provider]?.kind === "dns" && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act(a.id, "sync")}><RefreshCw className={`h-3.5 w-3.5 ${busy === a.id + "sync" ? "animate-spin" : ""}`} /> Sync domains</Button>}
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setToDelete({ id: a.id, name: a.name })}><Trash2 className="h-3.5 w-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add provider account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => { setProvider(v); setCreds({}); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PROVIDERS).map(([k, p]) => <SelectItem key={k} value={k}>{p.label} — {p.kind === "dns" ? "DNS" : "rDNS"}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Account name</Label><Input placeholder="e.g. Cloudflare — brand A" value={name} onChange={(e) => setName(e.target.value)} /></div>
            {meta.fields.map((f) => (
              <div key={f.id} className="space-y-1"><Label>{f.label}</Label><Input type={f.secret ? "password" : "text"} autoComplete="off" placeholder={f.placeholder} value={creds[f.id] ?? ""} onChange={(e) => setCreds({ ...creds, [f.id]: e.target.value })} /></div>
            ))}
            {meta.note && <p className="text-xs text-muted-foreground">{meta.note}</p>}
          </div>
          <DialogFooter><Button onClick={submit} disabled={!name}>Save & test</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete “{toDelete?.name}”?</AlertDialogTitle><AlertDialogDescription>The stored keys are erased. Domains stay in Cortex but can no longer be edited until linked to another account. Nothing changes at the provider.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={async () => { await del({ data: { id: toDelete!.id } }); setToDelete(null); refresh(); }}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}

function IpsTab() {
  const qc = useQueryClient();
  const accounts = useAccounts();
  const setPtr = useServerFn(setRdns);
  const check = useServerFn(checkRdns);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ip: "", hostname: "", account_id: "" });
  const { data = [] } = useQuery({ queryKey: ["sending_ips"], queryFn: async () => (await supabase.from("sending_ips").select("*").order("ip")).data ?? [] });
  const rdnsAccounts = (accounts.data ?? []).filter((a) => PROVIDERS[a.provider]?.kind === "rdns");
  const refresh = () => qc.invalidateQueries({ queryKey: ["sending_ips"] });

  async function add() {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(form.ip)) { toast.error("Enter a valid IPv4 address"); return; }
    const acc = rdnsAccounts.find((a) => a.id === form.account_id);
    const { error } = await supabase.from("sending_ips").insert({ ip: form.ip, hostname: form.hostname || null, account_id: form.account_id || null, provider: acc?.provider ?? null });
    if (error) { toast.error(error.message); return; }
    setOpen(false); setForm({ ip: "", hostname: "", account_id: "" }); refresh();
  }
  async function apply(id: string) {
    try { const r = await setPtr({ data: { ipId: id } }); toast.success(`rDNS updated (${r.message}). It can take a few minutes to show.`); await check({ data: { ids: [id] } }); }
    catch (e) { toast.error((e as Error).message); }
    refresh();
  }

  return (
    <Panel title="Sending IPs & reverse DNS" action={
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={!data.length} onClick={async () => { for (let i = 0; i < data.length; i += 50) await check({ data: { ids: data.slice(i, i + 50).map((d) => d.id) } }); refresh(); toast.success("rDNS checked"); }}><ShieldCheck className="h-3.5 w-3.5" /> Check all</Button>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Add IP</Button>
      </div>
    }>
      <p className="border-b px-4 py-2 text-xs text-muted-foreground">An IP passes when its PTR equals the hostname and the hostname resolves back to the same IP (forward-confirmed rDNS).</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>IP</TableHead><TableHead>Hostname (wanted)</TableHead><TableHead>Current PTR</TableHead><TableHead>Hosting account</TableHead><TableHead>rDNS</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {data.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No IPs yet.</TableCell></TableRow>}
            {data.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.ip}</TableCell>
                <TableCell>
                  <Input className="h-8 font-mono text-xs" defaultValue={r.hostname ?? ""} onBlur={async (e) => { if (e.target.value !== (r.hostname ?? "")) { await supabase.from("sending_ips").update({ hostname: e.target.value || null }).eq("id", r.id); refresh(); } }} />
                </TableCell>
                <TableCell className="font-mono text-xs">{r.ptr_current ?? "—"}</TableCell>
                <TableCell className="text-sm">{rdnsAccounts.find((a) => a.id === r.account_id)?.name ?? "—"}</TableCell>
                <TableCell>{r.rdns_ok == null ? <StatusBadge status="draft" /> : <StatusBadge status={r.rdns_ok ? "active" : "failed"} />}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" disabled={!r.account_id || !r.hostname} onClick={() => apply(r.id)}>Set rDNS</Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={async () => { if (confirm(`Remove ${r.ip}?`)) { await supabase.from("sending_ips").delete().eq("id", r.id); refresh(); } }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add sending IP</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>IP address</Label><Input value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value.trim() })} placeholder="203.0.113.10" /></div>
            <div className="space-y-1"><Label>Hostname for rDNS</Label><Input value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value.trim() })} placeholder="mta1.example.com" /></div>
            <div className="space-y-1"><Label>Hosting account</Label>
              <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                <SelectTrigger><SelectValue placeholder={rdnsAccounts.length ? "Choose account" : "Add a Hetzner/OVH/… account first"} /></SelectTrigger>
                <SelectContent>{rdnsAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({PROVIDERS[a.provider]?.label})</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={add}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
