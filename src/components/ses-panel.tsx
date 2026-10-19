import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2, Send, ShieldCheck, Globe } from "lucide-react";
import { Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtNum } from "@/lib/format";
import { deleteSesAccount, listSesAccounts, publishSesDkim, saveSesAccount, sesAction, sesIdentity, sesOverview } from "@/lib/ses.functions";

export function SesPanel({ canEdit, canCreate }: { canEdit: boolean; canCreate: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSesAccounts); const overviewFn = useServerFn(sesOverview); const actionFn = useServerFn(sesAction);
  const delFn = useServerFn(deleteSesAccount); const identityFn = useServerFn(sesIdentity); const dkimFn = useServerFn(publishSesDkim);
  const accounts = useQuery({ queryKey: ["ses-accounts"], queryFn: () => listFn() });
  const [active, setActive] = useState<string>("");
  const id = active || accounts.data?.[0]?.id || "";
  const ov = useQuery({ queryKey: ["ses-overview", id], enabled: !!id, retry: false, queryFn: () => overviewFn({ data: { id } }) });
  const [addOpen, setAddOpen] = useState(false); const [prodOpen, setProdOpen] = useState(false); const [testOpen, setTestOpen] = useState(false);
  const [identity, setIdentity] = useState(""); const [configSet, setConfigSet] = useState(""); const [detail, setDetail] = useState<{ name: string; data: Awaited<ReturnType<typeof identityFn>> } | null>(null);

  async function act(payload: Parameters<typeof actionFn>[0]["data"], ok: string) {
    try { const r = await actionFn({ data: payload }); toast.success(r?.messageId ? `${ok} · ${r.messageId}` : ok); qc.invalidateQueries({ queryKey: ["ses-overview", id] }); return true; }
    catch (e) { toast.error((e as Error).message); return false; }
  }
  async function openIdentity(name: string) {
    try { setDetail({ name, data: await identityFn({ data: { id, name } }) }); } catch (e) { toast.error((e as Error).message); }
  }

  if (accounts.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const a = ov.data?.account;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(accounts.data?.length ?? 0) > 0 && <Select value={id} onValueChange={setActive}><SelectTrigger className="w-64"><SelectValue placeholder="SES account" /></SelectTrigger><SelectContent>{accounts.data!.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select>}
        {id && <Button size="sm" variant="outline" aria-label="Refresh SES" onClick={() => ov.refetch()}><RefreshCw className={`h-4 w-4 ${ov.isFetching ? "animate-spin" : ""}`} /></Button>}
        {canCreate && <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" />Connect SES account</Button>}
        {id && canEdit && <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (!confirm("Remove this SES account from Cortex?")) return; await delFn({ data: { id } }); setActive(""); qc.invalidateQueries({ queryKey: ["ses-accounts"] }); }}><Trash2 className="h-4 w-4" />Remove</Button>}
      </div>
      {!accounts.data?.length && <p className="border-y py-8 text-center text-sm text-muted-foreground">No Amazon SES account connected. Create an IAM user with the <span className="font-mono">AmazonSESFullAccess</span> policy, then connect its access key here.</p>}
      {ov.isError && <p className="text-sm text-destructive">{(ov.error as Error).message}</p>}
      {a && <>
        <div className="grid gap-4 border-y py-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Mode" value={a.productionAccess ? "Production" : "Sandbox"} />
          <Stat label="Sending" value={a.sendingEnabled ? "Enabled" : "Paused"} />
          <Stat label="Reputation" value={a.enforcement || "—"} />
          <Stat label="24h quota" value={fmtNum(a.max24h)} />
          <Stat label="Sent last 24h" value={fmtNum(a.sentLast24h)} />
          <Stat label="Max rate / s" value={fmtNum(a.maxRate)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {!a.productionAccess && canEdit && <Button size="sm" variant="secondary" onClick={() => setProdOpen(true)}><ShieldCheck className="h-4 w-4" />Request production access{a.reviewStatus ? ` (${a.reviewStatus})` : ""}</Button>}
          {canEdit && <Button size="sm" variant="outline" onClick={() => setTestOpen(true)}><Send className="h-4 w-4" />Send SES test</Button>}
          {canEdit && <Button size="sm" variant="outline" onClick={() => act({ action: "set_suppression", id, reasons: ["BOUNCE", "COMPLAINT"] }, "Account suppression: bounces + complaints")}>Auto-suppress bounces & complaints {a.suppressionReasons.length ? `(${a.suppressionReasons.join(", ")})` : ""}</Button>}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={`Identities · ${ov.data!.identities.length}`}>
            {canEdit && <div className="flex gap-2 border-b p-3"><Input placeholder="example.com or sender@example.com" value={identity} onChange={(e) => setIdentity(e.target.value)} /><Button size="sm" disabled={!identity.trim()} onClick={async () => { if (await act({ action: "add_identity", id, name: identity.trim() }, "Identity created — publish its DKIM records")) { openIdentity(identity.trim()); setIdentity(""); } }}>Add</Button></div>}
            <ul className="divide-y">{ov.data!.identities.map((i: { name: string; type: string; verified: boolean; status: string }) => <li key={i.name} className="flex items-center justify-between gap-2 p-3 text-sm">
              <button className="text-left hover:underline" onClick={() => openIdentity(i.name)}>{i.name} <span className="text-xs text-muted-foreground">{i.type}</span></button>
              <div className="flex items-center gap-2"><Badge variant={i.verified ? "default" : "outline"}>{i.verified ? "Verified" : i.status || "Pending"}</Badge>{canEdit && <Button size="icon" variant="ghost" aria-label={`Delete ${i.name}`} onClick={() => confirm(`Delete identity ${i.name}?`) && act({ action: "delete_identity", id, name: i.name }, "Identity deleted")}><Trash2 className="h-3.5 w-3.5" /></Button>}</div>
            </li>)}{!ov.data!.identities.length && <li className="p-4 text-sm text-muted-foreground">No identities.</li>}</ul>
          </Panel>
          <div className="space-y-4">
            <Panel title="Configuration sets">
              {canEdit && <div className="flex gap-2 border-b p-3"><Input placeholder="cortex-marketing" value={configSet} onChange={(e) => setConfigSet(e.target.value)} /><Button size="sm" disabled={!configSet.trim()} onClick={async () => { if (await act({ action: "add_config_set", id, name: configSet.trim() }, "Configuration set created")) setConfigSet(""); }}>Create</Button></div>}
              <ul className="divide-y text-sm">{ov.data!.configurationSets.map((c: string) => <li key={c} className="p-3">{c}</li>)}{!ov.data!.configurationSets.length && <li className="p-4 text-muted-foreground">None.</li>}</ul>
            </Panel>
            <Panel title={`Suppression list · ${ov.data!.suppressed.length}`}>
              <ul className="max-h-72 divide-y overflow-auto text-sm">{ov.data!.suppressed.map((s: { email: string; reason: string }) => <li key={s.email} className="flex items-center justify-between p-3"><span>{s.email} <span className="text-xs text-muted-foreground">{s.reason}</span></span>{canEdit && <Button size="sm" variant="ghost" onClick={() => act({ action: "unsuppress", id, email: s.email }, "Removed from suppression")}>Remove</Button>}</li>)}{!ov.data!.suppressed.length && <li className="p-4 text-muted-foreground">Empty.</li>}</ul>
            </Panel>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">To relay a KumoMTA server through SES (useful when port 25 is blocked), open the server and choose this account under “Amazon SES relay”, then apply the config. Verify the sender domain in SES first.</p>
      </>}

      <AddSes open={addOpen} onOpenChange={setAddOpen} onDone={(newId) => { setActive(newId); qc.invalidateQueries({ queryKey: ["ses-accounts"] }); }} />
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{detail?.name}</DialogTitle></DialogHeader>
        <p className="text-sm">Sending: <b>{detail?.data.verified ? "verified" : "not verified"}</b> · DKIM: <b>{detail?.data.dkimStatus || "—"}</b></p>
        {!!detail?.data.dkimRecords.length && <><p className="text-xs text-muted-foreground">Add these CNAME records to your DNS:</p><pre className="overflow-auto bg-muted p-2 font-mono text-[11px]">{detail.data.dkimRecords.map((r: { name: string; value: string }) => `${r.name}  CNAME  ${r.value}`).join("\n")}</pre></>}
        <DialogFooter>{!!detail?.data.dkimRecords.length && !detail.name.includes("@") && <Button onClick={async () => { try { const r = await dkimFn({ data: { id, domain: detail!.name } }); toast.success(`${r.published} DKIM records published`); } catch (e) { toast.error((e as Error).message); } }}><Globe className="h-4 w-4" />Publish to my DNS provider</Button>}</DialogFooter>
      </DialogContent></Dialog>
      <ProdDialog open={prodOpen} onOpenChange={setProdOpen} onSubmit={(p) => act({ action: "request_production", id, ...p }, "Production access requested — AWS usually answers within 24h")} />
      <TestDialog open={testOpen} onOpenChange={setTestOpen} identities={(ov.data?.identities ?? []).filter((i: { verified: boolean }) => i.verified).map((i: { name: string }) => i.name)} onSubmit={(p) => act({ action: "send_test", id, ...p }, "Sent via SES")} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] uppercase text-muted-foreground">{label}</p><p className="text-lg font-semibold">{value}</p></div>;
}

const REGIONS = ["us-east-1", "us-east-2", "us-west-2", "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-north-1", "eu-south-1", "ca-central-1", "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "sa-east-1"];

function AddSes({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: (id: string) => void }) {
  const fn = useServerFn(saveSesAccount);
  const [f, setF] = useState({ name: "", access_key_id: "", secret_access_key: "", region: "eu-west-3" }); const [busy, setBusy] = useState(false);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Connect Amazon SES</DialogTitle></DialogHeader>
    <div className="grid gap-3">
      <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="SES Paris" /></div>
      <div className="space-y-1"><Label className="text-xs">Access key ID</Label><Input value={f.access_key_id} onChange={(e) => setF({ ...f, access_key_id: e.target.value })} placeholder="AKIA…" /></div>
      <div className="space-y-1"><Label className="text-xs">Secret access key</Label><Input type="password" value={f.secret_access_key} onChange={(e) => setF({ ...f, secret_access_key: e.target.value })} /></div>
      <div className="space-y-1"><Label className="text-xs">Region</Label><Select value={f.region} onValueChange={(region) => setF({ ...f, region })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
      <p className="text-xs text-muted-foreground">The key is tested, then stored encrypted. It never comes back to the browser.</p>
    </div>
    <DialogFooter><Button disabled={busy || !f.name || !f.access_key_id || !f.secret_access_key} onClick={async () => { setBusy(true); try { const r = await fn({ data: f }); onOpenChange(false); onDone(r.id); toast.success("SES connected"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>Test and save</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function ProdDialog({ open, onOpenChange, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (p: { website: string; useCase: string; mailType: "MARKETING" | "TRANSACTIONAL" }) => Promise<boolean> }) {
  const [website, setWebsite] = useState("https://"); const [useCase, setUseCase] = useState(""); const [mailType, setMailType] = useState<"MARKETING" | "TRANSACTIONAL">("MARKETING");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Request SES production access</DialogTitle></DialogHeader>
    <div className="space-y-3">
      <div className="space-y-1"><Label className="text-xs">Website</Label><Input value={website} onChange={(e) => setWebsite(e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Mail type</Label><Select value={mailType} onValueChange={(v) => setMailType(v as "MARKETING")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MARKETING">Marketing</SelectItem><SelectItem value="TRANSACTIONAL">Transactional</SelectItem></SelectContent></Select></div>
      <div className="space-y-1"><Label className="text-xs">Use case (how you collect consent, handle bounces, complaints and unsubscribes)</Label><Textarea rows={6} value={useCase} onChange={(e) => setUseCase(e.target.value)} /></div>
    </div>
    <DialogFooter><Button disabled={useCase.trim().length < 20} onClick={async () => { if (await onSubmit({ website, useCase, mailType })) onOpenChange(false); }}>Submit to AWS</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function TestDialog({ open, onOpenChange, identities, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; identities: string[]; onSubmit: (p: { from: string; to: string[]; subject: string; html: string }) => Promise<boolean> }) {
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [subject, setSubject] = useState("Cortex SES test"); const [html, setHtml] = useState("<p>Hello from Cortex via Amazon SES.</p>");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Send a test through SES</DialogTitle></DialogHeader>
    <div className="space-y-3">
      <div className="space-y-1"><Label className="text-xs">From (verified identity{identities.length ? `: ${identities.slice(0, 3).join(", ")}` : ""})</Label><Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="news@example.com" /></div>
      <div className="space-y-1"><Label className="text-xs">To (comma separated, max 10)</Label><Input value={to} onChange={(e) => setTo(e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">HTML</Label><Textarea rows={4} className="font-mono text-xs" value={html} onChange={(e) => setHtml(e.target.value)} /></div>
      <p className="text-xs text-muted-foreground">In sandbox mode, recipients must also be verified identities.</p>
    </div>
    <DialogFooter><Button disabled={!from || !to} onClick={async () => { if (await onSubmit({ from, to: to.split(/[\s,;]+/).filter(Boolean), subject, html })) onOpenChange(false); }}><Send className="h-4 w-4" />Send</Button></DialogFooter>
  </DialogContent></Dialog>;
}
