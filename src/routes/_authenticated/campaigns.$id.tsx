import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DemoBadge, PageHeader, Panel, StatusBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CampaignForm, emptyCampaign, toRow, type CampaignValues } from "@/components/campaign-form";
import { availableActions, nextStatus, type CampaignAction, type CampaignStatus } from "@/lib/campaign-status";
import { EMAIL_RE, fmtDate, fmtMoney, fmtNum, fmtPct, pct } from "@/lib/format";
import { logActivity, useMe } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/campaigns/$id")({
  head: () => ({ meta: [{ title: "Campaign — Cortex" }, { name: "description", content: "Campaign details and controls." }] }),
  component: CampaignPage,
});

const ACTION_LABEL: Record<CampaignAction, string> = {
  schedule: "Schedule", start: "Start now", pause: "Pause", resume: "Resume", stop: "Stop", cancel: "Cancel", archive: "Archive",
};

function CampaignPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [testOpen, setTestOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  const { data: c, isLoading } = useQuery({
    queryKey: ["campaigns", id],
    queryFn: async () => (await supabase.from("campaigns").select("*, email_lists(name)").eq("id", id).maybeSingle()).data,
  });
  const logs = useQuery({
    queryKey: ["campaign_logs", id],
    queryFn: async () => (await supabase.from("campaign_logs").select("*").eq("campaign_id", id).order("created_at", { ascending: false })).data ?? [],
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!c) return <p className="text-muted-foreground">Campaign not found.</p>;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["campaigns"] });
    qc.invalidateQueries({ queryKey: ["campaign_logs", id] });
  };

  async function run(action: CampaignAction) {
    if (!c) return;
    if (action === "schedule" && !c.scheduled_at) { toast.error("Set a start date in Delivery & tracking first."); return; }
    const status = nextStatus(c.status as CampaignStatus, action);
    const { error } = await supabase.from("campaigns").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("campaign_logs").insert({ campaign_id: id, message: `${ACTION_LABEL[action]} → ${status} (demo sender)` });
    await logActivity("campaigns", action, c.name);
    toast.success(`Campaign ${status}`);
    refresh();
  }

  async function sendTest() {
    if (!EMAIL_RE.test(testEmail)) { toast.error("Enter a valid email"); return; }
    await supabase.from("campaign_logs").insert({ campaign_id: id, message: `Test email queued to ${testEmail} (demo mode — no real send)` });
    await logActivity("campaigns", "send_test", `${c?.name} → ${testEmail}`);
    toast.success("Test email logged (demo mode)");
    setTestOpen(false);
    refresh();
  }

  const values: CampaignValues = {
    ...emptyCampaign,
    ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== null)),
    daily_limit: c.daily_limit ?? 0,
    scheduled_at: c.scheduled_at ? new Date(c.scheduled_at).toISOString().slice(0, 16) : "",
  } as CampaignValues;

  const canExec = me?.can("campaigns", "execute");
  const metrics = [
    ["Sent", fmtNum(c.sent)], ["Delivered", fmtNum(c.delivered)], ["Delivery rate", fmtPct(pct(c.delivered, c.sent))],
    ["Opens", fmtNum(c.opens)], ["Open rate", fmtPct(pct(c.opens, c.delivered))], ["Clicks", fmtNum(c.clicks)],
    ["Click rate", fmtPct(pct(c.clicks, c.delivered))], ["Bounces", fmtNum(c.bounces)], ["Unsubscribes", fmtNum(c.unsubscribes)],
    ["Complaints", fmtNum(c.complaints)], ["Conversions", fmtNum(c.conversions)], ["Revenue", fmtMoney(Number(c.revenue))],
    ["Cost", fmtMoney(Number(c.cost))], ["Profit", fmtMoney(Number(c.revenue) - Number(c.cost))],
  ];

  return (
    <div>
      <Link to="/campaigns" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Campaigns
      </Link>
      <PageHeader
        title={c.name}
        subtitle={`${c.email_lists?.name ?? "No list"} · ${c.subject}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={c.status} />
            <DemoBadge />
            <Button variant="outline" size="sm" onClick={() => setTestOpen(true)}><Send className="h-3.5 w-3.5" /> Send test</Button>
            {canExec && availableActions(c.status as CampaignStatus).map((a) => (
              <Button key={a} size="sm" variant={a === "start" || a === "resume" ? "default" : a === "cancel" ? "destructive" : "secondary"} onClick={() => run(a)}>
                {ACTION_LABEL[a]}
              </Button>
            ))}
          </div>
        }
      />
      <Tabs defaultValue="stats">
        <TabsList>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="log">Execution log</TabsTrigger>
        </TabsList>
        <TabsContent value="stats">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4 lg:grid-cols-7">
            {metrics.map(([l, v]) => (
              <div key={l} className="bg-card p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{l}</p>
                <p className="kpi-value mt-1 text-lg font-semibold">{v}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Scheduled: {fmtDate(c.scheduled_at)} · Speed {fmtNum(c.send_speed)}/h · Pool {c.server_pool ?? "—"}</p>
        </TabsContent>
        <TabsContent value="edit">
          {me?.can("campaigns", "edit") ? (
            <CampaignForm
              key={c.updated_at}
              defaultValues={values}
              submitLabel="Save changes"
              onSubmit={async (v) => {
                const { error } = await supabase.from("campaigns").update({ ...toRow(v), updated_at: new Date().toISOString() }).eq("id", id);
                if (error) { toast.error(error.message); return; }
                await supabase.from("campaign_logs").insert({ campaign_id: id, message: "Campaign edited" });
                await logActivity("campaigns", "edit", v.name);
                toast.success("Saved");
                refresh();
              }}
            />
          ) : <p className="text-sm text-muted-foreground">You don't have permission to edit campaigns.</p>}
        </TabsContent>
        <TabsContent value="log">
          <Panel>
            <ul className="divide-y font-mono text-xs">
              {(logs.data ?? []).length === 0 && <li className="p-4 text-muted-foreground">No log entries.</li>}
              {(logs.data ?? []).map((l) => (
                <li key={l.id} className="flex gap-3 px-4 py-2">
                  <span className="shrink-0 text-muted-foreground">{fmtDate(l.created_at)}</span>
                  <span className="uppercase text-primary">{l.level}</span>
                  <span>{l.message}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </TabsContent>
      </Tabs>
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send a test email</DialogTitle></DialogHeader>
          <Input type="email" placeholder="you@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
          <p className="text-xs text-muted-foreground">Demo mode: the test is logged but not delivered until a sending server is connected.</p>
          <DialogFooter><Button onClick={sendTest}>Send test</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
