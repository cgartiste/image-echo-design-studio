import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Panel } from "@/components/page";
import { KNOWN_VARS, validateHtml } from "@/lib/format";
import { AlertTriangle, CheckCircle2, Monitor, Smartphone, Upload } from "lucide-react";

export const campaignSchema = z.object({
  name: z.string().trim().min(1, "Required").max(120),
  subject: z.string().trim().min(1, "Required").max(200),
  preheader: z.string().max(200).optional().or(z.literal("")),
  from_name: z.string().trim().min(1, "Required").max(100),
  from_email: z.string().trim().email("Invalid email"),
  reply_to: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  list_id: z.string().uuid("Choose a list"),
  offer: z.string().max(100).optional().or(z.literal("")),
  html_content: z.string().max(500_000),
  text_content: z.string().max(200_000).optional().or(z.literal("")),
  server_pool: z.string().max(100).optional().or(z.literal("")),
  send_speed: z.coerce.number().int().min(1).max(1_000_000),
  daily_limit: z.coerce.number().int().min(0).optional(),
  scheduled_at: z.string().optional().or(z.literal("")),
  timezone: z.string().min(1),
  track_opens: z.boolean(),
  track_clicks: z.boolean(),
  track_conversions: z.boolean(),
  handle_unsubscribes: z.boolean(),
  handle_bounces: z.boolean(),
  use_global_suppression: z.boolean(),
});
export type CampaignValues = z.infer<typeof campaignSchema>;

export const emptyCampaign: CampaignValues = {
  name: "", subject: "", preheader: "", from_name: "", from_email: "", reply_to: "", list_id: "",
  offer: "", html_content: '<h1>Hello {{first_name}}</h1>\n<p>Your message here.</p>\n<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
  text_content: "", server_pool: "default", send_speed: 1000, daily_limit: 0, scheduled_at: "", timezone: "UTC",
  track_opens: true, track_clicks: true, track_conversions: false, handle_unsubscribes: true, handle_bounces: true,
  use_global_suppression: true,
};

export function CampaignForm({
  defaultValues, onSubmit, submitLabel,
}: { defaultValues: CampaignValues; onSubmit: (v: CampaignValues) => Promise<void>; submitLabel: string }) {
  const form = useForm<CampaignValues>({ resolver: zodResolver(campaignSchema), defaultValues });
  const { register, handleSubmit, watch, setValue, formState } = form;
  const errors = formState.errors;
  const lists = useQuery({
    queryKey: ["lists", "options"],
    queryFn: async () => (await supabase.from("email_lists").select("id,name").eq("is_archived", false).order("name")).data ?? [],
  });
  const html = watch("html_content");
  const issues = validateHtml(html);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  const field = (name: keyof CampaignValues, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <Input id={name} {...register(name)} {...props} />
      {errors[name] && <p className="text-xs text-destructive">{String(errors[name]?.message)}</p>}
    </div>
  );
  const toggle = (name: keyof CampaignValues, label: string) => (
    <label className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
      {label}
      <Switch checked={watch(name) as boolean} onCheckedChange={(v) => setValue(name, v as never)} />
    </label>
  );

  async function importHtml(f?: File) {
    if (!f) return;
    setValue("html_content", await f.text(), { shouldDirty: true });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Tabs defaultValue="setup">
        <TabsList>
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="delivery">Delivery & tracking</TabsTrigger>
        </TabsList>
        <TabsContent value="setup">
          <Panel className="grid gap-4 p-4 md:grid-cols-2">
            {field("name", "Internal name")}
            {field("subject", "Subject")}
            {field("preheader", "Pre-header")}
            {field("offer", "Offer")}
            {field("from_name", "From name")}
            {field("from_email", "From email", { type: "email" })}
            {field("reply_to", "Reply-to", { type: "email" })}
            <div className="space-y-1">
              <Label className="text-xs">Target list</Label>
              <Select value={watch("list_id")} onValueChange={(v) => setValue("list_id", v, { shouldValidate: true })}>
                <SelectTrigger><SelectValue placeholder="Select a list" /></SelectTrigger>
                <SelectContent>
                  {(lists.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.list_id && <p className="text-xs text-destructive">{errors.list_id.message}</p>}
            </div>
          </Panel>
        </TabsContent>
        <TabsContent value="content">
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel
              title="HTML creative"
              action={
                <label className="flex cursor-pointer items-center gap-1 text-xs text-primary">
                  <Upload className="h-3 w-3" /> Import HTML
                  <input type="file" accept=".html,.htm,text/html" className="hidden" onChange={(e) => importHtml(e.target.files?.[0])} />
                </label>
              }
            >
              <Textarea {...register("html_content")} spellCheck={false} className="min-h-[420px] rounded-none border-0 font-mono text-xs focus-visible:ring-0" />
              <div className="space-y-1 border-t p-3 text-xs">
                {issues.length === 0 ? (
                  <p className="flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" /> All checks passed</p>
                ) : issues.map((i) => (
                  <p key={i} className="flex items-center gap-1 text-warning-foreground dark:text-warning"><AlertTriangle className="h-3.5 w-3.5" /> {i}</p>
                ))}
                <p className="pt-1 text-muted-foreground">Variables: {KNOWN_VARS.map((v) => `{{${v}}}`).join(" ")}</p>
              </div>
            </Panel>
            <Panel
              title="Live preview"
              action={
                <div className="flex gap-1">
                  <Button type="button" size="icon" variant={device === "desktop" ? "secondary" : "ghost"} className="h-7 w-7" onClick={() => setDevice("desktop")}><Monitor className="h-3.5 w-3.5" /></Button>
                  <Button type="button" size="icon" variant={device === "mobile" ? "secondary" : "ghost"} className="h-7 w-7" onClick={() => setDevice("mobile")}><Smartphone className="h-3.5 w-3.5" /></Button>
                </div>
              }
            >
              <div className="flex justify-center bg-muted p-3">
                <iframe
                  title="preview"
                  sandbox=""
                  srcDoc={html.replaceAll("{{first_name}}", "Alex").replaceAll("{{unsubscribe_url}}", "#")}
                  className="h-[460px] rounded border bg-card transition-all"
                  style={{ width: device === "desktop" ? "100%" : 375 }}
                />
              </div>
            </Panel>
            <Panel title="Text version" className="xl:col-span-2">
              <Textarea {...register("text_content")} className="min-h-32 rounded-none border-0 font-mono text-xs" />
            </Panel>
          </div>
        </TabsContent>
        <TabsContent value="delivery">
          <Panel className="grid gap-4 p-4 md:grid-cols-3">
            {field("server_pool", "Server / pool")}
            {field("send_speed", "Send speed (msgs/hour)", { type: "number" })}
            {field("daily_limit", "Daily limit (0 = none)", { type: "number" })}
            {field("scheduled_at", "Start at", { type: "datetime-local" })}
            {field("timezone", "Timezone")}
            <div />
            {toggle("track_opens", "Track opens")}
            {toggle("track_clicks", "Track clicks")}
            {toggle("track_conversions", "Track conversions")}
            {toggle("handle_unsubscribes", "Handle unsubscribes")}
            {toggle("handle_bounces", "Handle bounces")}
            {toggle("use_global_suppression", "Global suppression list")}
          </Panel>
        </TabsContent>
      </Tabs>
      <div className="flex justify-end">
        <Button type="submit" disabled={formState.isSubmitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}

export function toRow(v: CampaignValues) {
  return {
    ...v,
    preheader: v.preheader || null,
    reply_to: v.reply_to || null,
    offer: v.offer || null,
    text_content: v.text_content || null,
    server_pool: v.server_pool || null,
    daily_limit: v.daily_limit || null,
    scheduled_at: v.scheduled_at ? new Date(v.scheduled_at).toISOString() : null,
  };
}
