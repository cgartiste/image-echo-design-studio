import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SponsorForm } from "@/components/sponsor-form";
import {
  createLoginSession, deleteSponsor, fetchOffers, fetchSuppression, getSponsor, importOffers, reportLoginResult, saveSponsor, syncConversions, testSponsor,
} from "@/lib/sponsors.functions";
import { LOGIN_RESULTS, PLATFORMS, buildTrackingLink, validateTrackingTemplate } from "@/lib/sponsor-platforms";
import { fmtDate, fmtMoney } from "@/lib/format";
import { useMe } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/sponsors/$id")({
  head: () => ({ meta: [{ title: "Sponsor — Cortex" }, { name: "description", content: "Sponsor integration, offers, conversions and tracking." }] }),
  component: SponsorPage,
});

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

function SponsorPage() {
  const { id } = Route.useParams();
  const get = useServerFn(getSponsor);
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: me } = useMe();
  const { data: sp } = useQuery({ queryKey: ["sponsor", id], queryFn: () => get({ data: { id } }) });
  const test = useServerFn(testSponsor);
  const del = useServerFn(deleteSponsor);
  const login = useServerFn(createLoginSession);
  const report = useServerFn(reportLoginResult);
  const [checks, setChecks] = useState<{ name: string; ok: boolean; message: string }[] | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["sponsor", id] }); qc.invalidateQueries({ queryKey: ["sponsor-events", id] }); qc.invalidateQueries({ queryKey: ["sponsors"] }); };

  async function run<T>(key: string, f: () => Promise<T>) {
    setBusy(key);
    try { return await f(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); refresh(); }
  }
  async function openSponsor() {
    const w = window.open("about:blank", "_blank");
    const r = await run("login", () => login({ data: { id } }));
    if (!r) { w?.close(); return; }
    setSession(r.sessionId);
    if (w) w.location.href = `${window.location.origin}/api/public/sponsor-login/${r.token}`;
  }

  if (!sp) return <p className="text-muted-foreground">Loading…</p>;
  const p = PLATFORMS[sp.platform];
  return (
    <div>
      <PageHeader title={sp.name} subtitle={`${p?.label ?? sp.platform} · status: ${sp.status}${sp.last_error ? ` — ${sp.last_error}` : ""}`}
        actions={<>
          {me?.can("offers", "execute") && <Button variant="outline" disabled={!!busy} onClick={async () => { const r = await run("test", () => test({ data: { id } })); if (r) { setChecks(r.checks); toast[r.ok ? "success" : "error"](r.ok ? "Connection OK" : "Connection problem"); } }}><PlugZap className="mr-1 h-4 w-4" />{busy === "test" ? "Testing…" : "Test connection"}</Button>}
          {me?.can("offers", "execute") && sp.login_driver !== "none" && <Button disabled={!!busy} onClick={openSponsor}><ExternalLink className="mr-1 h-4 w-4" />Open sponsor</Button>}
          {me?.can("offers", "delete") && <Button variant="ghost" onClick={async () => { if (confirm("Delete this sponsor and its offers?")) { await run("del", () => del({ data: { id } })); nav({ to: "/sponsors" }); } }}><Trash2 className="h-4 w-4" /></Button>}
        </>} />

      {checks && <Panel className="mb-4 p-4"><ul className="space-y-1 text-sm">{checks.map((c) => <li key={c.name} className={c.ok ? "text-success" : "text-destructive"}>{c.ok ? "✓" : "✗"} {c.name}: {c.message}</li>)}{checks.length === 0 && <li className="text-muted-foreground">No API or login configured to test.</li>}</ul></Panel>}
      {session && (
        <Panel className="mb-4 p-4">
          <p className="mb-2 text-sm">A one-time login link opened in a new tab (valid 2 minutes, password never in the URL). How did it go?</p>
          <div className="flex flex-wrap gap-2">{LOGIN_RESULTS.map((r) => <Button key={r} size="sm" variant={r === "success" ? "default" : "outline"} onClick={async () => { await run("rep", () => report({ data: { sessionId: session, result: r as "success" } })); setSession(null); toast.success("Result recorded"); }}>{r.replace(/_/g, " ")}</Button>)}</div>
        </Panel>
      )}

      <Tabs defaultValue="offers">
        <TabsList className="flex-wrap">
          <TabsTrigger value="offers">Offers</TabsTrigger>
          <TabsTrigger value="conversions">Conversions</TabsTrigger>
          <TabsTrigger value="suppression">Suppression</TabsTrigger>
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
          <TabsTrigger value="settings">Settings & credentials</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="offers"><OffersTab id={id} canFetch={!!p?.supportsOffersImport && !!me?.can("offers", "create")} /></TabsContent>
        <TabsContent value="conversions"><ConversionsTab id={id} enabled={!!p?.supportsConversions} /></TabsContent>
        <TabsContent value="suppression"><SuppressionTab id={id} /></TabsContent>
        <TabsContent value="tracking"><TrackingTab template={sp.tracking_template ?? p?.trackingFormat ?? ""} sponsorId={id} /></TabsContent>
        <TabsContent value="settings"><SettingsTab sp={sp} onSaved={refresh} /></TabsContent>
        <TabsContent value="history"><HistoryTab id={id} /></TabsContent>
      </Tabs>
    </div>
  );
}

function OffersTab({ id, canFetch }: { id: string; canFetch: boolean }) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(fetchOffers);
  const importFn = useServerFn(importOffers);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [assign, setAssign] = useState(true);
  const [busy, setBusy] = useState(false);
  const { data = [] } = useQuery({ queryKey: ["offers", id], queryFn: async () => (await supabase.from("offers").select("*").eq("sponsor_id", id).order("name")).data ?? [] });
  const reload = () => { qc.invalidateQueries({ queryKey: ["offers", id] }); qc.invalidateQueries({ queryKey: ["sponsor-events", id] }); };
  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-3 border-b p-3">
        {canFetch && <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); try { const r = await fetchFn({ data: { id } }); toast.success(`${r.count} offers fetched`); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); reload(); } }}><RefreshCw className="mr-1 h-4 w-4" />{busy ? "Fetching…" : "Fetch offers from network"}</Button>}
        <Button size="sm" variant="outline" disabled={!sel.size} onClick={async () => { try { const r = await importFn({ data: { ids: [...sel], assign } }); toast.success(`${r.count} offers imported`); setSel(new Set()); } catch (e) { toast.error((e as Error).message); } finally { reload(); } }}>Import selected ({sel.size})</Button>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={assign} onCheckedChange={(v) => setAssign(!!v)} />Assign to me</label>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead className="w-8"><Checkbox checked={data.length > 0 && sel.size === data.length} onCheckedChange={(v) => setSel(v ? new Set(data.map((o) => o.id)) : new Set())} /></TableHead><TableHead>Offer</TableHead><TableHead>Payout</TableHead><TableHead>Vertical</TableHead><TableHead>Countries</TableHead><TableHead>Imported</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No offers yet.</TableCell></TableRow>}
          {data.map((o) => (
            <TableRow key={o.id}>
              <TableCell><Checkbox checked={sel.has(o.id)} onCheckedChange={(v) => { const n = new Set(sel); v ? n.add(o.id) : n.delete(o.id); setSel(n); }} /></TableCell>
              <TableCell><div className="flex items-center gap-2">{o.image_url && <img src={o.image_url} alt="" className="h-8 w-8 rounded object-cover" />}<div><div className="font-medium">{o.name}</div><div className="font-mono text-xs text-muted-foreground">#{o.external_id}{o.preview_url && <> · <a href={o.preview_url} target="_blank" rel="noreferrer" className="underline">preview</a></>}</div></div></div></TableCell>
              <TableCell>{fmtMoney(Number(o.payout))} <span className="text-xs text-muted-foreground">{o.payout_type}</span></TableCell>
              <TableCell className="text-xs">{o.vertical ?? "—"}</TableCell>
              <TableCell className="text-xs">{o.countries.slice(0, 6).join(", ")}</TableCell>
              <TableCell>{o.imported ? "✓" : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function ConversionsTab({ id, enabled }: { id: string; enabled: boolean }) {
  const qc = useQueryClient();
  const sync = useServerFn(syncConversions);
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState(false);
  const { data = [] } = useQuery({ queryKey: ["conversions", id], queryFn: async () => (await supabase.from("conversions").select("*").eq("sponsor_id", id).order("converted_at", { ascending: false }).limit(500)).data ?? [] });
  return (
    <Panel>
      <div className="flex flex-wrap items-end gap-3 border-b p-3">
        <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <Button disabled={!enabled || busy} onClick={async () => { setBusy(true); try { const r = await sync({ data: { id, from, to } }); toast.success(`${r.count} conversions · ${fmtMoney(r.revenue)}`); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); qc.invalidateQueries({ queryKey: ["conversions", id] }); } }}>{busy ? "Syncing…" : "Sync conversions"}</Button>
        {!enabled && <span className="text-xs text-muted-foreground">This platform has no conversion API.</span>}
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Offer</TableHead><TableHead>Payout</TableHead><TableHead>User</TableHead><TableHead>Campaign</TableHead><TableHead>List / subscriber</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No conversions synced.</TableCell></TableRow>}
          {data.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="text-xs">{fmtDate(c.converted_at)}</TableCell><TableCell>{c.offer_name ?? c.offer_external_id}</TableCell><TableCell>{fmtMoney(Number(c.payout))}</TableCell>
              <TableCell className="font-mono text-xs">{c.user_ref ?? "—"}</TableCell><TableCell className="font-mono text-xs">{c.campaign_ref ?? "—"}</TableCell><TableCell className="font-mono text-xs">{c.list_ref ?? "—"} / {c.subscriber_ref ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function SuppressionTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(fetchSuppression);
  const [offer, setOffer] = useState("");
  const [manual, setManual] = useState("");
  const { data: offers = [] } = useQuery({ queryKey: ["offers", id], queryFn: async () => (await supabase.from("offers").select("*").eq("sponsor_id", id).order("name")).data ?? [] });
  const { data = [] } = useQuery({ queryKey: ["supp", id], queryFn: async () => (await supabase.from("suppression_files").select("*").eq("sponsor_id", id).order("created_at", { ascending: false })).data ?? [] });
  const names = Object.fromEntries(offers.map((o) => [o.id, o.name]));
  return (
    <Panel>
      <div className="flex flex-wrap items-end gap-3 border-b p-3">
        <div className="min-w-56"><Label>Offer</Label><Select value={offer} onValueChange={setOffer}><SelectTrigger><SelectValue placeholder="Choose offer" /></SelectTrigger><SelectContent>{offers.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="min-w-72 flex-1"><Label>Manual link (optional — Optizmo, Google Sheets, Dropbox, direct)</Label><Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="https://…" /></div>
        <Button disabled={!offer} onClick={async () => { try { await fn({ data: { offerId: offer, manualUrl: manual || undefined } }); toast.success("Suppression file added"); setManual(""); } catch (e) { toast.error((e as Error).message); } finally { qc.invalidateQueries({ queryKey: ["supp", id] }); } }}>Get suppression file</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Offer</TableHead><TableHead>Source</TableHead><TableHead>Download</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No suppression files.</TableCell></TableRow>}
          {data.map((s) => (
            <TableRow key={s.id}><TableCell className="text-xs">{fmtDate(s.created_at)}</TableCell><TableCell>{s.offer_id ? names[s.offer_id] : "—"}</TableCell><TableCell className="text-xs">{s.source_type}</TableCell>
              <TableCell><a className="text-sm underline" href={s.download_url ?? s.source_url} target="_blank" rel="noreferrer">{s.source_type === "google_sheets" ? "Download CSV" : "Open"}</a></TableCell></TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function TrackingTab({ template, sponsorId }: { template: string; sponsorId: string }) {
  const [base, setBase] = useState("https://track.example.com/click?a=123");
  const [vars, setVars] = useState({ user: "12", offer: "345", campaign: "67", list: "8", email: "9001", interface: "2" });
  const errors = validateTrackingTemplate(template);
  const link = buildTrackingLink(base, template, { ...vars, sponsor: sponsorId.slice(0, 8) });
  return (
    <Panel className="space-y-4 p-4">
      <div><Label>Template</Label><p className="rounded bg-muted p-2 font-mono text-xs">{template || "—"}</p>
        {errors.length > 0 ? <p className="mt-1 text-xs text-destructive">{errors.join(" · ")}</p> : <p className="mt-1 text-xs text-success">Template valid</p>}</div>
      <div><Label>Offer tracking URL</Label><Input value={base} onChange={(e) => setBase(e.target.value)} /></div>
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        {(Object.keys(vars) as (keyof typeof vars)[]).map((k) => <div key={k}><Label className="text-xs">[{k}]</Label><Input value={vars[k]} onChange={(e) => setVars({ ...vars, [k]: e.target.value })} /></div>)}
      </div>
      <div><Label>Preview</Label><p className="break-all rounded bg-muted p-2 font-mono text-xs">{link}</p></div>
    </Panel>
  );
}

function SettingsTab({ sp, onSaved }: { sp: any; onSaved: () => void }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const save = useServerFn(saveSponsor);
  return (
    <Panel className="p-4">
      <p className="mb-4 text-xs text-muted-foreground">Passwords and API keys are encrypted on the server and never sent back to the browser.</p>
      <SponsorForm initial={sp} onSubmit={async (v) => { try { await save({ data: { ...v, id: sp.id } }); toast.success("Saved"); onSaved(); } catch (e) { toast.error((e as Error).message); } }} />
    </Panel>
  );
}

function HistoryTab({ id }: { id: string }) {
  const { data = [] } = useQuery({ queryKey: ["sponsor-events", id], queryFn: async () => (await supabase.from("sponsor_events").select("*").eq("sponsor_id", id).order("created_at", { ascending: false }).limit(200)).data ?? [] });
  return (
    <Panel>
      <ul className="divide-y">
        {data.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No events yet.</li>}
        {data.map((e) => (
          <li key={e.id} className="flex gap-3 p-3 text-sm">
            <span className="w-36 shrink-0 text-xs text-muted-foreground">{fmtDate(e.created_at)}</span>
            <span className="w-44 shrink-0 font-mono text-xs">{e.kind}</span>
            <span className={e.level === "error" ? "text-destructive" : e.level === "warn" ? "text-warning" : ""}>{e.message}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
