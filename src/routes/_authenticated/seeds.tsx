import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Inbox, Loader2, MailOpen, Plus, RefreshCw, Search, ShieldAlert, Star, Trash2, Undo2 } from "lucide-react";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import { gmailMonitorSchema } from "@/lib/gmail-monitor";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMe } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { inboxRate, type Placement, type SeedAction } from "@/lib/seed-placement";
import { checkPlacement, completeSeedConnect, deleteSeed, listSeeds, readSeedMessage, seedAction, seedMessages, startSeedConnect } from "@/lib/seeds.functions";

export const Route = createFileRoute("/_authenticated/seeds")({
  head: () => ({ meta: [{ title: "Gmail placement monitoring — Cortex" }, { name: "description", content: "Connected Gmail test inboxes and warming placement monitoring." }, { property: "og:title", content: "Gmail placement monitoring — Cortex" }, { property: "og:description", content: "Connected Gmail test inboxes and warming placement monitoring." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: SeedsPage,
});

const placementTone: Record<Placement, string> = {
  inbox: "bg-success/15 text-success", spam: "bg-destructive/15 text-destructive", promotions: "bg-warning/20 text-warning-foreground dark:text-warning",
  updates: "bg-info/15 text-info", social: "bg-info/15 text-info", forums: "bg-info/15 text-info", trash: "bg-muted text-muted-foreground", archived: "bg-muted text-muted-foreground",
};
function PlacementBadge({ p }: { p: Placement }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${placementTone[p]}`}>{p}</span>;
}

function waitForOAuth(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => { window.removeEventListener("message", onMessage); if (poll !== undefined) window.clearInterval(poll); };
    const onMessage = (e: MessageEvent) => {
      const type = e.data?.type;
      if (e.origin !== window.location.origin || e.source !== popup || e.data?.connectorId !== "google_mail" || (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")) return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") resolve(typeof e.data?.code === "string" ? e.data.code : null);
      else { popup.close(); reject(new Error("Google connection failed.")); }
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => { if (!popup.closed) return; cleanup(); reject(new Error("Window closed before the connection finished.")); }, 500);
  });
}

type Msg = { id: string; subject: string; from: string; date: string; snippet: string; unread: boolean; starred: boolean; placement: Placement };

function SeedsPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const canSettings = !!me?.can("servers", "settings");
  const canExec = !!me?.can("servers", "execute");
  const list = useServerFn(listSeeds);
  const start = useServerFn(startSeedConnect);
  const complete = useServerFn(completeSeedConnect);
  const del = useServerFn(deleteSeed);
  const check = useServerFn(checkPlacement);
  const act = useServerFn(seedAction);
  const { data: seeds = [], isLoading } = useQuery({ queryKey: ["seeds"], queryFn: () => list() });
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [from, setFrom] = useState("");
  const [days, setDays] = useState(2);
  const [monitoring, setMonitoring] = useState(false);
  const [minutes, setMinutes] = useState(5);
  const [open, setOpen] = useState<{ id: string; email: string | null } | null>(null);

  async function connect(seedId?: string) {
    const popup = window.open("", "cortex-gmail", "width=600,height=720");
    if (!popup) { toast.error("Popup blocked. Allow popups and try again."); return; }
    setBusy(seedId ?? "new");
    try {
      const r = await start({ data: { seedId, label: label || undefined } });
      const done = waitForOAuth(popup);
      popup.location.href = r.authorizationUrl;
      const code = await done;
      const res = await complete({ data: { seedId: r.seedId, code } });
      toast.success(seedId ? `Reconnected ${res.email ?? "inbox"}` : `Connected ${res.email ?? "inbox"}`);
      setLabel("");
    } catch (e) {
      popup.close();
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      qc.invalidateQueries({ queryKey: ["seeds"] });
    }
  }

  const placement = useMutation({
    mutationFn: () => check({ data: { subject, from, days } }),
    onError: (e) => toast.error((e as Error).message),
  });
  const monitorRef = useRef(placement);
  monitorRef.current = placement;
  useEffect(() => {
    if (!monitoring) return;
    const timer = window.setInterval(() => {
      if (!monitorRef.current.isPending) monitorRef.current.mutate();
    }, minutes * 60_000);
    return () => window.clearInterval(timer);
  }, [monitoring, minutes]);
  const action = useMutation({
    mutationFn: (v: { action: SeedAction; items: { seedId: string; messageId: string }[] }) => act({ data: v }),
    onSuccess: (r) => { toast.success(`${r.done} messages updated`); r.errors.forEach((e) => toast.error(e)); placement.data && placement.mutate(); qc.invalidateQueries({ queryKey: ["seed-msgs"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const found = placement.data?.results.flatMap((r) => r.messages.map((m) => ({ ...m, seedId: r.seedId }))) ?? [];
  const rate = inboxRate(found.map((m) => m.placement));
  const spamItems = found.filter((m) => m.placement === "spam" || m.placement === "promotions").map((m) => ({ seedId: m.seedId, messageId: m.id }));
  const connected = seeds.filter((s) => s.connected).length;

  return (
    <div>
      <PageHeader title="Seed inboxes" />

      <Panel className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-semibold">Test accounts</h2>
            <p className="text-sm text-muted-foreground">{connected} connected · {seeds.length} total</p>
          </div>
          {canSettings && (
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} className="h-9 w-48" />
              <Button onClick={() => connect()} disabled={busy !== null}>{busy === "new" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}Connect Gmail</Button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Status</TableHead><TableHead>Last check</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && seeds.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No test inbox yet. Click “Connect Gmail” and sign in with a Google account.</TableCell></TableRow>}
              {seeds.map((s) => (
                <TableRow key={s.id}>
                  <TableCell><div className="font-medium">{s.email ?? "Not connected yet"}</div><div className="text-xs text-muted-foreground">{s.label}</div></TableCell>
                  <TableCell>{s.connected ? <Badge>Connected</Badge> : s.reconnect_required ? <Badge variant="destructive">Needs reconnect</Badge> : <Badge variant="secondary">Pending</Badge>}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{s.last_checked_at ? fmtDate(s.last_checked_at) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {s.connected && <Button size="sm" variant="outline" onClick={() => setOpen({ id: s.id, email: s.email })}><Inbox className="mr-1 h-3.5 w-3.5" />Open</Button>}
                      {canSettings && !s.connected && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => connect(s.id)}><RefreshCw className="mr-1 h-3.5 w-3.5" />{s.reconnect_required ? "Reconnect" : "Connect"}</Button>}
                      {canSettings && <Button size="sm" variant="ghost" aria-label="Remove" onClick={async () => { if (!confirm(`Remove ${s.email ?? "this inbox"}?`)) return; try { await del({ data: { seedId: s.id } }); qc.invalidateQueries({ queryKey: ["seeds"] }); } catch (e) { toast.error((e as Error).message); } }}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Panel>
        <div className="border-b p-4">
          <h2 className="font-semibold">Inbox placement check</h2>
          <p className="text-sm text-muted-foreground">Search every connected inbox for a campaign and see if it reached Inbox, Promotions or Spam.</p>
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); placement.mutate(); }}>
            <Input disabled={monitoring} maxLength={200} placeholder="Subject contains…" value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9 w-full sm:w-64" />
            <Input disabled={monitoring} maxLength={200} placeholder="Sender (email or domain)" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-full sm:w-56" />
            <Input disabled={monitoring} type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} className="h-9 w-20" aria-label="Days" />
            <span className="self-center text-sm text-muted-foreground">days</span>
            <Button type="submit" disabled={placement.isPending || connected === 0}>{placement.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />}Check</Button>
          </form>
          <div className="mt-4 border-t pt-4 space-y-2">
            <h3 className="font-medium">{t("gmail.monitor")}</h3>
            <div className="flex flex-wrap items-center gap-3">
              <Switch id="gmail-monitor" checked={monitoring} disabled={connected === 0} onCheckedChange={(v) => {
                if (v) {
                  const validation = gmailMonitorSchema.safeParse({ subject, from, minutes });
                  if (!validation.success) { toast.error(validation.error.issues[0]?.message ?? "Invalid monitor settings"); return; }
                  if (!placement.isPending) placement.mutate();
                }
                setMonitoring(v);
              }} />
              <Label htmlFor="gmail-monitor">{t("gmail.auto")}</Label>
              <Label htmlFor="gmail-minutes">{t("gmail.interval")}</Label>
              <Input id="gmail-minutes" className="w-20" type="number" min={5} max={60} value={minutes} disabled={monitoring} onChange={(e) => setMinutes(Number(e.target.value))} />
              <Badge variant={monitoring ? "default" : "secondary"}>{monitoring ? t("gmail.active") : t("gmail.stopped")}</Badge>
            </div>
          </div>
        </div>
        {placement.data && (
          <div className="p-4">
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <div><div className="text-3xl font-semibold">{rate === null ? "—" : `${rate}%`}</div><div className="text-xs text-muted-foreground">primary inbox</div></div>
              {(["inbox", "promotions", "spam"] as Placement[]).map((p) => <div key={p} className="text-sm"><PlacementBadge p={p} /> {found.filter((m) => m.placement === p).length}</div>)}
              <div className="text-sm text-muted-foreground">Missing in {placement.data.results.filter((r) => !r.error && r.messages.length === 0).length} inboxes</div>
              {canExec && spamItems.length > 0 && <Button size="sm" className="ml-auto" disabled={action.isPending} onClick={() => action.mutate({ action: "rescue", items: spamItems })}><Undo2 className="mr-1 h-4 w-4" />Move {spamItems.length} to inbox</Button>}
            </div>
            <div className="space-y-2">
              {placement.data.results.map((r) => (
                <div key={r.seedId} className="rounded-md border p-3">
                  <div className="mb-1 flex items-center justify-between text-sm font-medium">{r.email}{r.error && <span className="text-xs text-destructive">{r.error}</span>}</div>
                  {!r.error && r.messages.length === 0 && <div className="text-xs text-muted-foreground">Not found</div>}
                  {r.messages.map((m) => (
                    <div key={m.id} className="flex flex-wrap items-center gap-2 py-1 text-sm">
                      <PlacementBadge p={m.placement} /><span className="min-w-0 flex-1 truncate">{m.subject}</span>
                      {canExec && <RowActions onAction={(a) => action.mutate({ action: a, items: [{ seedId: r.seedId, messageId: m.id }] })} />}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {open && <InboxDialog seed={open} canExec={canExec} onClose={() => setOpen(null)} onAction={(a, id) => action.mutate({ action: a, items: [{ seedId: open.id, messageId: id }] })} />}
    </div>
  );
}

function RowActions({ onAction }: { onAction: (a: SeedAction) => void }) {
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" title="Move to inbox" onClick={() => onAction("rescue")}><Undo2 className="h-3.5 w-3.5" /></Button>
      <Button size="sm" variant="ghost" title="Mark as read" onClick={() => onAction("read")}><MailOpen className="h-3.5 w-3.5" /></Button>
      <Button size="sm" variant="ghost" title="Star" onClick={() => onAction("star")}><Star className="h-3.5 w-3.5" /></Button>
      <Button size="sm" variant="ghost" title="Mark important" onClick={() => onAction("important")}><ShieldAlert className="h-3.5 w-3.5" /></Button>
    </div>
  );
}

function InboxDialog({ seed, canExec, onClose, onAction }: { seed: { id: string; email: string | null }; canExec: boolean; onClose: () => void; onAction: (a: SeedAction, id: string) => void }) {
  const fetchMsgs = useServerFn(seedMessages);
  const read = useServerFn(readSeedMessage);
  const [folder, setFolder] = useState<"inbox" | "spam" | "promotions" | "all">("inbox");
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const msgs = useQuery({ queryKey: ["seed-msgs", seed.id, folder, search], queryFn: () => fetchMsgs({ data: { seedId: seed.id, folder, search } }) as Promise<Msg[]> });
  const detail = useQuery({ queryKey: ["seed-msg", seed.id, sel], enabled: !!sel, queryFn: () => { if (!sel) throw new Error("Choose a message"); return read({ data: { seedId: seed.id, messageId: sel } }); } });
  const [checked, setChecked] = useState<string[]>([]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>{seed.email}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-2">
          {(["inbox", "promotions", "spam", "all"] as const).map((f) => <Button key={f} size="sm" variant={folder === f ? "default" : "outline"} className="capitalize" onClick={() => { setFolder(f); setSel(null); setChecked([]); }}>{f}</Button>)}
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-48" />
          {canExec && checked.length > 0 && (
            <div className="ml-auto flex gap-1">
              {(["rescue", "read", "star", "trash"] as SeedAction[]).map((a) => <Button key={a} size="sm" variant="outline" className="capitalize" onClick={() => { checked.forEach((id) => onAction(a, id)); setChecked([]); }}>{a === "rescue" ? "Move to inbox" : a}</Button>)}
            </div>
          )}
        </div>
        {sel && detail.data ? (
          <div className="space-y-2">
            <Button size="sm" variant="ghost" onClick={() => setSel(null)}>← Back</Button>
            <div className="text-lg font-semibold">{detail.data.subject}</div>
            <div className="text-xs text-muted-foreground">{detail.data.from} → {detail.data.to} · {detail.data.date}</div>
            <div className="flex flex-wrap gap-2 text-xs">
              <PlacementBadge p={detail.data.placement} />
              {(["spf", "dkim", "dmarc"] as const).map((k) => <span key={k} className={`rounded px-1.5 py-0.5 ${detail.data.auth[k] === "pass" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>{k.toUpperCase()} {detail.data.auth[k] ?? "?"}</span>)}
              <span className={`rounded px-1.5 py-0.5 ${detail.data.listUnsubscribe ? "bg-success/15 text-success" : "bg-warning/20"}`}>List-Unsubscribe {detail.data.listUnsubscribe ? "yes" : "missing"}</span>
            </div>
            {detail.data.html ? <iframe title="message" sandbox="" srcDoc={detail.data.html} className="h-[420px] w-full rounded border bg-background" /> : <pre className="whitespace-pre-wrap text-sm">{detail.data.text}</pre>}
          </div>
        ) : (
          <div className="divide-y rounded border">
            {(msgs.isLoading || detail.isFetching) && <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>}
            {msgs.error && <div className="p-4 text-sm text-destructive">{(msgs.error as Error).message}</div>}
            {msgs.data?.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">No messages.</div>}
            {msgs.data?.map((m) => (
              <div key={m.id} className="flex items-center gap-2 p-2 text-sm hover:bg-muted/50">
                {canExec && <Checkbox checked={checked.includes(m.id)} onCheckedChange={(v) => setChecked((c) => v ? [...c, m.id] : c.filter((x) => x !== m.id))} />}
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSel(m.id)}>
                  <div className={`truncate ${m.unread ? "font-semibold" : ""}`}>{m.subject || "(no subject)"}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.from} · {m.snippet}</div>
                </button>
                <PlacementBadge p={m.placement} />
                {canExec && <RowActions onAction={(a) => onAction(a, m.id)} />}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
