import { z } from "zod";
import { EMAIL_RE, pct } from "./format";

export const settingsSchema = z.object({
  description: z.string().max(2000).default(""),
  owner_id: z.string().default(""),
  campaign_type: z.enum(["newsletter", "promotion", "transactional", "autoresponder", "ab_test", "follow_up", "reactivation"]).default("newsletter"),
  test_mode: z.boolean().default(false),
  included_lists: z.array(z.string().uuid()).default([]),
  excluded_lists: z.array(z.string().uuid()).default([]),
  country: z.string().max(100).default(""),
  engagement_min: z.coerce.number().min(0).max(100).default(0),
  bounce_email: z.string().default(""),
  tracking_domain: z.string().default(""),
  offer_id: z.string().default(""),
  headers: z.string().max(10000).default("From: [from_name] <[from_email]>\nSubject: [subject]"),
  content_type: z.enum(["html", "text", "multipart"]).default("multipart"),
  charset: z.enum(["UTF-8", "ISO-8859-1"]).default("UTF-8"),
  encoding: z.enum(["8bit", "base64", "quoted-printable"]).default("quoted-printable"),
  url_suffix: z.string().max(2000).default(""),
  footer_size: z.enum(["small", "medium", "large"]).default("medium"),
  footer_language: z.enum(["en", "fr"]).default("en"),
  legal_text: z.string().max(2000).default(""),
  postal_address: z.string().max(500).default(""),
  scheduled_end: z.string().default(""),
  alternate_subject: z.string().max(200).default(""),
  alternate_html: z.string().max(500000).default(""),
  smart_mode: z.enum(["disabled", "geography", "device"]).default("disabled"),
  smart_rules: z.array(z.object({ key: z.string().max(100), url: z.string().max(2000), priority: z.coerce.number().min(0).max(1000) })).max(100).default([]),
  smart_fallback: z.string().max(2000).default(""),
  redirect_enabled: z.boolean().default(false),
  redirect_url: z.string().max(2000).default(""),
  redirect_fallback: z.string().max(2000).default(""),
  delivery: z.object({ interface_every: z.coerce.number().int().min(1).default(100), message_delay: z.coerce.number().min(0).default(0), minute_limit: z.coerce.number().int().min(1).default(100), batch_size: z.coerce.number().int().min(1).default(100), batch_pause: z.coerce.number().min(0).default(60) }).default({}),
  ab: z.object({
    enabled: z.boolean().default(false),
    test_on: z.enum(["subject", "from_name", "content", "full"]).default("subject"),
    split_mode: z.enum(["equal", "sample"]).default("sample"),
    test_percent: z.coerce.number().min(1).max(100).default(20),
    winner_metric: z.enum(["open", "click", "conversion"]).default("open"),
    wait_hours: z.coerce.number().min(1).max(168).default(4),
    variants: z.array(z.object({ name: z.string().max(40), subject: z.string().max(200), from_name: z.string().max(100), html: z.string().max(500000) })).max(4).default([]),
  }).default({}),
  random: z.object({
    spintax: z.boolean().default(true),
    from_names: z.string().max(5000).default(""),
    subjects: z.string().max(10000).default(""),
    shuffle_recipients: z.boolean().default(true),
    jitter_min: z.coerce.number().min(0).max(3600).default(0),
    jitter_max: z.coerce.number().min(0).max(3600).default(0),
  }).default({}),
});
export type CampaignSettings = z.infer<typeof settingsSchema>;
export function parseSettings(value: unknown): CampaignSettings {
  const parsed = settingsSchema.safeParse(value);
  return parsed.success ? parsed.data : settingsSchema.parse({});
}
export type RecipientSummary = { raw: number; duplicates: number; unsubscribed: number; bounces: number; complaints: number; blocked: number; invalid: number; excluded: number; final: number };

export function campaignRates(c: { sent: number; delivered: number; opens: number; clicks: number; bounces: number; unsubscribes: number; conversions: number }) {
  return { open: pct(c.opens,c.delivered), ctr: pct(c.clicks,c.delivered), bounce: pct(c.bounces,c.sent), unsubscribe: pct(c.unsubscribes,c.delivered), conversion: pct(c.conversions,c.clicks) };
}
export function maskEmails(message: string) {
  return message.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => `${email.slice(0,1)}***@${email.split("@")[1]}`);
}
export function renderCampaignPreview(html: string, values: Record<string,string> = {}) {
  const vars = { first_name:"John",last_name:"Doe",email:"john@example.com",country:"France",city:"Paris",list_name:"Campaign Demo",offer_name:"Demo offer",unsubscribe_url:"#unsubscribe",webview_url:"#webview",campaign_id:"preview", ...values };
  return html.replace(/\{\{\s*([a-z_]+)\s*\}\}|\[([a-z_]+)\]/g, (match,a:string,b:string) => {
    const value = vars[(a || b) as keyof typeof vars];
    return value === undefined ? match : value.replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  });
}
export function publicationChecks(v: { name:string; subject:string; from_email:string; html_content:string; handle_unsubscribes:boolean; settings: CampaignSettings }, count:number, verified:boolean) {
  return [
    { key:"name", ok:!!v.name.trim() }, { key:"recipients", ok:count>0 },
    { key:"subject", ok:!!v.subject.trim() }, { key:"sender", ok:EMAIL_RE.test(v.from_email) },
    { key:"domain", ok:verified }, { key:"bounce", ok:EMAIL_RE.test(v.settings.bounce_email) },
    { key:"content", ok:!!v.html_content.trim() }, { key:"unsubscribe", ok:v.handle_unsubscribes && /\{\{unsubscribe_url\}\}|\[unsubscribe_url\]/.test(v.html_content) },
    { key:"server", ok:false }, { key:"interface", ok:false }, { key:"queue", ok:false },
  ];
}