import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Plus, ShieldCheck, Trash2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, StatusBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TemplateDialog } from "@/components/dns-template-dialog";
import { checkDomains, deleteRecord, getRecords, saveRecord, setNameservers } from "@/lib/dns.functions";
import { CHECK_WEIGHTS, type CheckKey, type DnsRecord, type DomainChecks } from "@/lib/dns-records";
import { PROVIDERS } from "@/lib/provider-meta";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/domains/$id")({
  head: () => ({ meta: [{ title: "Domain — Cortex" }, { name: "description", content: "DNS records and email authentication for a domain." }] }),
  component: DomainPage,
});

const LABELS: Record<CheckKey, string> = { spf: "SPF", dkim: "DKIM", dmarc: "DMARC", mx: "MX", mta_sts: "MTA-STS", tls_rpt: "TLS-RPT", bimi: "BIMI", return_path: "Bounce / Return-Path" };
const TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"] as const;

function DomainPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const check = useServerFn(checkDomains);
  const fetchRecords = useServerFn(getRecords);
  const save = useServerFn(saveRecord);
  const del = useServerFn(deleteRecord);
  const setNs = useServerFn(setNameservers);
  const [edit, setEdit] = useState<{ rec: DnsRecord; original?: DnsRecord } | null>(null);
  const [tpl, setTpl] = useState(false);
  const [nsOpen, setNsOpen] = useState(false);
  const [ns, setNsText] = useState("");
  const [filter, setFilter] = useState("all");

  const { data: d } = useQuery({ queryKey: ["domains", id], queryFn: async () => (await supabase.from("domains").select("*").eq("id", id).maybeSingle()).data });
  const records = useQuery({ queryKey: ["dns_records", id], enabled: !!d?.account_id, retry: false, queryFn: () => fetchRecords({ data: { domainId: id } }) });

  if (!d) return <p className="text-muted-foreground">Loading…</p>;
  const checks = (d.checks ?? {}) as DomainChecks;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["domains"] }); qc.invalidateQueries({ queryKey: ["dns_records", id] }); };

  async function runCheck() {
    try { await check({ data: { ids: [id] } }); toast.success("Checked"); } catch (e) { toast.error((e as Error).message); }
    refresh();
  }
  async function submitRecord() {
    if (!edit) return;
    try {
      const r = edit.rec;
      const name = r.name === "@" || !r.name ? d!.name : r.name.endsWith(d!.name) ? r.name : `${r.name}.${d!.name}`;
      await save({ data: { domainId: id, record: { ...r, name }, ...(edit.original ? { replace: edit.original } : {}) } });
      toast.success("Record saved at provider");
      setEdit(null); refresh();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function removeRecord(r: DnsRecord) {
    if (!confirm(`Delete ${r.type} ${r.name} at the provider?\n${r.content}`)) return;
    try { await del({ data: { domainId: id, record: r } }); toast.success("Deleted"); refresh(); } catch (e) { toast.error((e as Error).message); }
  }
  async function submitNs() {
    try { await setNs({ data: { domainId: id, nameservers: ns.split(/[\s,]+/).filter(Boolean) } }); toast.success("Nameservers updated at registrar"); setNsOpen(false); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  }
  const recs = (records.data ?? []).filter((r) => filter === "all" || r.type === filter);
  const canNs = d.provider === "sav" || d.provider === "godaddy";

  return (
    <div>
      <Link to="/domains" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" /> Domains</Link>
      <PageHeader
        title={d.name}
        subtitle={`${d.provider ? PROVIDERS[d.provider]?.label : "No provider linked"} · score ${d.score}/100 · checked ${fmtDate(d.last_checked_at)}`}
        actions={<>
          <Button variant="outline" onClick={runCheck}><ShieldCheck className="h-4 w-4" /> Check now</Button>
          {d.account_id && <Button onClick={() => setTpl(true)}><Wand2 className="h-4 w-4" /> Publish email records</Button>}
          {canNs && <Button variant="outline" onClick={() => { setNsText(d.nameservers.join("\n")); setNsOpen(true); }}>Nameservers</Button>}
        </>}
      />
      <div className="mb-4 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(CHECK_WEIGHTS) as CheckKey[]).map((k) => {
          const c = checks[k];
          return (
            <div key={k} className="bg-card p-3">
              <div className="flex items-center justify-between"><p className="text-sm font-semibold">{LABELS[k]}</p>{c ? <StatusBadge status={c.ok ? "active" : "failed"} /> : <StatusBadge status="draft" />}</div>
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{c?.value ?? "—"}</p>
              {c?.issue && <p className="mt-1 text-xs text-warning-foreground dark:text-warning">{c.issue}</p>}
            </div>
          );
        })}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">Nameservers: <span className="font-mono">{d.nameservers.join(", ") || "—"}</span> · DKIM selector checked: <span className="font-mono">{d.dkim_selector}</span>. Sending is blocked until SPF, DKIM and DMARC all pass.</p>

      <Panel title="DNS records" action={d.account_id && (
        <div className="flex gap-2">
          <Select value={filter} onValueChange={setFilter}><SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          {d.provider !== "sav" && <Button size="sm" onClick={() => setEdit({ rec: { type: "TXT", name: "@", content: "", ttl: 3600 } })}><Plus className="h-3.5 w-3.5" /> Add record</Button>}
        </div>
      )}>
        {!d.account_id && <p className="p-4 text-sm text-muted-foreground">Link this domain by syncing a Cloudflare, GoDaddy or Sav account to edit its records.</p>}
        {d.provider === "sav" && <p className="p-4 text-sm text-muted-foreground">Sav.com's API cannot edit DNS records. Use “Nameservers” to point this domain to Cloudflare, add it in Cloudflare, then sync that account.</p>}
        {records.isError && <p className="p-4 text-sm text-destructive">{(records.error as Error).message}</p>}
        {d.account_id && d.provider !== "sav" && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Name</TableHead><TableHead>Content</TableHead><TableHead className="text-right">TTL</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {records.isLoading && <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Loading from provider…</TableCell></TableRow>}
                {recs.map((r) => (
                  <TableRow key={(r.id ?? "") + r.content}>
                    <TableCell><span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]">{r.type}</span></TableCell>
                    <TableCell className="font-mono text-xs">{r.name}</TableCell>
                    <TableCell className="max-w-md break-all font-mono text-xs">{r.priority != null && <span className="text-muted-foreground">{r.priority} </span>}{r.content}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.ttl === 1 ? "auto" : r.ttl}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit({ rec: { ...r }, original: r })}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeRecord(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.original ? "Edit record" : "Add record"}</DialogTitle></DialogHeader>
          {edit && <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1"><Label>Type</Label><Select value={edit.rec.type} onValueChange={(v) => setEdit({ ...edit, rec: { ...edit.rec, type: v } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1 sm:col-span-3"><Label>Name</Label><Input className="font-mono text-xs" value={edit.rec.name} onChange={(e) => setEdit({ ...edit, rec: { ...edit.rec, name: e.target.value } })} placeholder="@ or sub" /></div>
            <div className="space-y-1 sm:col-span-4"><Label>Content</Label><Input className="font-mono text-xs" value={edit.rec.content} onChange={(e) => setEdit({ ...edit, rec: { ...edit.rec, content: e.target.value } })} /></div>
            <div className="space-y-1"><Label>TTL</Label><Input type="number" value={edit.rec.ttl} onChange={(e) => setEdit({ ...edit, rec: { ...edit.rec, ttl: Number(e.target.value) || 3600 } })} /></div>
            {edit.rec.type === "MX" && <div className="space-y-1"><Label>Priority</Label><Input type="number" value={edit.rec.priority ?? 10} onChange={(e) => setEdit({ ...edit, rec: { ...edit.rec, priority: Number(e.target.value) } })} /></div>}
          </div>}
          <DialogFooter><Button onClick={submitRecord}>Save at provider</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={nsOpen} onOpenChange={setNsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change nameservers</DialogTitle></DialogHeader>
          <textarea className="min-h-28 w-full rounded-md border bg-background p-2 font-mono text-xs" value={ns} onChange={(e) => setNsText(e.target.value)} placeholder={"ada.ns.cloudflare.com\nbob.ns.cloudflare.com"} />
          <p className="text-xs text-muted-foreground">Changing nameservers moves all DNS for this domain. Copy any records you need first. Changes can take up to 48 hours to spread.</p>
          <DialogFooter><Button variant="destructive" onClick={submitNs}>Update nameservers</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <TemplateDialog open={tpl} onOpenChange={setTpl} domainIds={[id]} onDone={runCheck} />
    </div>
  );
}
