import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, StatusBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SponsorForm } from "@/components/sponsor-form";
import { listSponsors, saveSponsor } from "@/lib/sponsors.functions";
import { PLATFORMS, LOGIN_DRIVERS } from "@/lib/sponsor-platforms";
import { fmtDate, fmtMoney } from "@/lib/format";
import { useMe } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/sponsors/")({
  head: () => ({ meta: [{ title: "Sponsors & Offers — Cortex" }, { name: "description", content: "Affiliate networks, offers, conversions and secure auto-login." }, { property: "og:title", content: "Sponsors & Offers — Cortex" }, { property: "og:description", content: "Affiliate networks, offers, conversions and secure auto-login." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: SponsorsPage,
});

function SponsorsPage() {
  const { data: me } = useMe();
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <PageHeader title="Sponsors & Offers" subtitle="Everflow, Cake, HasOffers, HitPath and more — credentials stay encrypted on the server."
        actions={me?.can("offers", "create") && <Button onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" />Add sponsor</Button>} />
      {adding && <AddSponsor onClose={() => setAdding(false)} />}
      <Tabs defaultValue="sponsors">
        <TabsList className="flex-wrap">
          <TabsTrigger value="sponsors">Sponsors</TabsTrigger>
          <TabsTrigger value="offers">Offers</TabsTrigger>
          <TabsTrigger value="conversions">Conversions</TabsTrigger>
          <TabsTrigger value="sessions">Auto-login sessions</TabsTrigger>
          <TabsTrigger value="drivers">Drivers</TabsTrigger>
          <TabsTrigger value="logs">Error log</TabsTrigger>
        </TabsList>
        <TabsContent value="sponsors"><SponsorsTab /></TabsContent>
        <TabsContent value="offers"><OffersTab /></TabsContent>
        <TabsContent value="conversions"><ConversionsTab /></TabsContent>
        <TabsContent value="sessions"><SessionsTab /></TabsContent>
        <TabsContent value="drivers"><DriversTab /></TabsContent>
        <TabsContent value="logs"><LogsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function useSponsors() {
  const fn = useServerFn(listSponsors);
  return useQuery({ queryKey: ["sponsors"], queryFn: () => fn() });
}

function AddSponsor({ onClose }: { onClose: () => void }) {
  const save = useServerFn(saveSponsor);
  const nav = useNavigate();
  return (
    <Panel title="New sponsor" className="mb-6">
      <div className="p-4">
        <SponsorForm onCancel={onClose} onSubmit={async (v) => {
          try { const r = await save({ data: v }); toast.success("Sponsor created"); nav({ to: "/sponsors/$id", params: { id: r.id } }); }
          catch (e) { toast.error((e as Error).message); }
        }} />
      </div>
    </Panel>
  );
}

function SponsorsTab() {
  const { data = [], isLoading } = useSponsors();
  return (
    <Panel>
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Platform</TableHead><TableHead>API</TableHead><TableHead>Auto-login</TableHead><TableHead>Status</TableHead><TableHead>Last test</TableHead></TableRow></TableHeader>
        <TableBody>
          {isLoading && <TableRow><TableCell colSpan={6} className="text-muted-foreground">Loading…</TableCell></TableRow>}
          {!isLoading && data.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No sponsors yet. Add one from a template.</TableCell></TableRow>}
          {data.map((s) => (
            <TableRow key={s.id}>
              <TableCell><Link to="/sponsors/$id" params={{ id: s.id }} className="font-medium hover:underline">{s.name}</Link></TableCell>
              <TableCell>{PLATFORMS[s.platform]?.label ?? s.platform}</TableCell>
              <TableCell className="text-xs">{s.api_driver === "none" ? "—" : s.has_api_key ? "Key saved" : "Key missing"}</TableCell>
              <TableCell className="text-xs">{s.login_driver === "none" ? "—" : LOGIN_DRIVERS[s.login_driver]?.label}</TableCell>
              <TableCell><StatusBadge status={s.status === "connected" ? "active" : s.status === "error" ? "failed" : "draft"} /> <span className="ml-1 text-xs text-muted-foreground">{s.status}</span></TableCell>
              <TableCell className="text-xs text-muted-foreground">{fmtDate(s.last_test_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function OffersTab() {
  const { data = [] } = useQuery({ queryKey: ["offers-all"], queryFn: async () => (await supabase.from("offers").select("id,name,external_id,payout,payout_type,status,imported,countries,sponsor_id").order("updated_at", { ascending: false }).limit(500)).data ?? [] });
  const { data: sponsors = [] } = useSponsors();
  const names = Object.fromEntries(sponsors.map((s) => [s.id, s.name]));
  return (
    <Panel>
      <Table>
        <TableHeader><TableRow><TableHead>Offer</TableHead><TableHead>Sponsor</TableHead><TableHead>Payout</TableHead><TableHead>Countries</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No offers. Open a sponsor and fetch its offers.</TableCell></TableRow>}
          {data.map((o) => (
            <TableRow key={o.id}>
              <TableCell><div className="font-medium">{o.name}</div><div className="font-mono text-xs text-muted-foreground">#{o.external_id}</div></TableCell>
              <TableCell><Link to="/sponsors/$id" params={{ id: o.sponsor_id }} className="hover:underline">{names[o.sponsor_id] ?? "—"}</Link></TableCell>
              <TableCell>{fmtMoney(Number(o.payout))} <span className="text-xs text-muted-foreground">{o.payout_type}</span></TableCell>
              <TableCell className="text-xs">{o.countries.slice(0, 5).join(", ")}</TableCell>
              <TableCell>{o.imported ? <StatusBadge status="active" /> : <span className="text-xs text-muted-foreground">available</span>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function ConversionsTab() {
  const { data = [] } = useQuery({ queryKey: ["conversions-all"], queryFn: async () => (await supabase.from("conversions").select("*").order("converted_at", { ascending: false }).limit(500)).data ?? [] });
  const total = data.reduce((a, c) => a + Number(c.payout), 0);
  return (
    <Panel title={`${data.length} conversions · ${fmtMoney(total)}`}>
      <Table>
        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Offer</TableHead><TableHead>Payout</TableHead><TableHead>User</TableHead><TableHead>Campaign</TableHead><TableHead>List</TableHead><TableHead>Subscriber</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No conversions synced yet.</TableCell></TableRow>}
          {data.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="text-xs">{fmtDate(c.converted_at)}</TableCell>
              <TableCell>{c.offer_name ?? c.offer_external_id}</TableCell>
              <TableCell>{fmtMoney(Number(c.payout))}</TableCell>
              <TableCell className="font-mono text-xs">{c.user_ref ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs">{c.campaign_ref ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs">{c.list_ref ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs">{c.subscriber_ref ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function SessionsTab() {
  const { data = [] } = useQuery({ queryKey: ["login-sessions"], queryFn: async () => (await supabase.from("sponsor_login_sessions").select("id,sponsor_id,user_email,created_at,expires_at,used_at,result,ip").order("created_at", { ascending: false }).limit(200)).data ?? [] });
  const { data: sponsors = [] } = useSponsors();
  const names = Object.fromEntries(sponsors.map((s) => [s.id, s.name]));
  return (
    <Panel>
      <Table>
        <TableHeader><TableRow><TableHead>Created</TableHead><TableHead>Sponsor</TableHead><TableHead>User</TableHead><TableHead>Opened</TableHead><TableHead>IP</TableHead><TableHead>Result</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No auto-login sessions yet.</TableCell></TableRow>}
          {data.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="text-xs">{fmtDate(s.created_at)}</TableCell>
              <TableCell>{names[s.sponsor_id] ?? "—"}</TableCell>
              <TableCell className="text-xs">{s.user_email}</TableCell>
              <TableCell className="text-xs">{s.used_at ? fmtDate(s.used_at) : "not opened"}</TableCell>
              <TableCell className="font-mono text-xs">{s.ip ?? "—"}</TableCell>
              <TableCell className="text-xs">{s.result}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function DriversTab() {
  const yes = (b: boolean) => (b ? "✓" : "—");
  return (
    <Panel>
      <Table>
        <TableHeader><TableRow><TableHead>Platform</TableHead><TableHead>API driver</TableHead><TableHead>Login driver</TableHead><TableHead>Version</TableHead><TableHead>Offers</TableHead><TableHead>Conversions</TableHead><TableHead>Suppression</TableHead><TableHead>Auto-login</TableHead></TableRow></TableHeader>
        <TableBody>
          {Object.values(PLATFORMS).map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.label}<div className="text-xs text-muted-foreground">{p.apiHint}</div></TableCell>
              <TableCell className="font-mono text-xs">{p.apiDriver}</TableCell>
              <TableCell className="font-mono text-xs">{p.loginDriver}</TableCell>
              <TableCell className="text-xs">v{p.driverVersion}</TableCell>
              <TableCell>{yes(p.supportsOffersImport)}</TableCell>
              <TableCell>{yes(p.supportsConversions)}</TableCell>
              <TableCell>{yes(p.supportsSuppression)}</TableCell>
              <TableCell>{yes(p.supportsAutoLogin)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function LogsTab() {
  const { data = [] } = useQuery({ queryKey: ["sponsor-errors"], queryFn: async () => (await supabase.from("sponsor_events").select("*").neq("level", "info").order("created_at", { ascending: false }).limit(200)).data ?? [] });
  return (
    <Panel>
      <ul className="divide-y">
        {data.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No errors recorded.</li>}
        {data.map((e) => (
          <li key={e.id} className="flex gap-3 p-3 text-sm">
            <span className="w-36 shrink-0 text-xs text-muted-foreground">{fmtDate(e.created_at)}</span>
            <span className="w-40 shrink-0 font-mono text-xs">{e.kind}</span>
            <span className={e.level === "error" ? "text-destructive" : ""}>{e.message}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
