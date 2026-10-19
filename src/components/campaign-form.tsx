import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { KNOWN_VARS, validateHtml } from "@/lib/format";
import { settingsSchema, parseSettings, renderCampaignPreview, publicationChecks, type RecipientSummary } from "@/lib/campaign-model";
import { recipientSummary } from "@/lib/campaigns.functions";
import { download } from "@/lib/csv";
import { useMe } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { AlertTriangle, CheckCircle2, Monitor, Smartphone, Upload, Save, Send, FolderOpen, Download, Search, Plus, Trash2, RefreshCw, Server, Unplug } from "lucide-react";

export const campaignSchema = z.object({
  name:z.string().trim().min(1,"Required").max(120), subject:z.string().trim().min(1,"Required").max(200),
  preheader:z.string().max(200).optional().or(z.literal("")), from_name:z.string().trim().min(1,"Required").max(100),
  from_email:z.string().trim().email("Invalid email"), reply_to:z.string().trim().email("Invalid email").optional().or(z.literal("")),
  list_id:z.string().uuid("Choose a list"), offer:z.string().max(100).optional().or(z.literal("")),
  html_content:z.string().max(500000), text_content:z.string().max(200000).optional().or(z.literal("")),
  server_pool:z.string().max(100).optional().or(z.literal("")), send_speed:z.coerce.number().int().min(1).max(1000000),
  daily_limit:z.coerce.number().int().min(0).optional(), scheduled_at:z.string().optional().or(z.literal("")), timezone:z.string().min(1),
  track_opens:z.boolean(), track_clicks:z.boolean(), track_conversions:z.boolean(),handle_unsubscribes:z.boolean(),handle_bounces:z.boolean(),use_global_suppression:z.boolean(),
  settings:settingsSchema,
});
export type CampaignValues = z.infer<typeof campaignSchema>;
export const emptyCampaign:CampaignValues = {
  name:"",subject:"",preheader:"",from_name:"",from_email:"",reply_to:"",list_id:"",offer:"",
  html_content:'<h1>Hello {{first_name}}</h1>\n<p>Your message here.</p>\n<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
  text_content:"",server_pool:"default",send_speed:1000,daily_limit:0,scheduled_at:"",timezone:"UTC",
  track_opens:true,track_clicks:true,track_conversions:false,handle_unsubscribes:true,handle_bounces:true,use_global_suppression:true,settings:parseSettings({}),
};

function Section({title,children,action}:{title:string;children:React.ReactNode;action?:React.ReactNode}) {
  return <section className="min-w-0 border-b pb-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{title}</h2>{action}</div><div className="space-y-3">{children}</div></section>;
}
export function CampaignForm({defaultValues,onSubmit,submitLabel}:{defaultValues:CampaignValues;onSubmit:(v:CampaignValues)=>Promise<void>;submitLabel:string}) {
  const form=useForm<CampaignValues>({resolver:zodResolver(campaignSchema) as Resolver<CampaignValues>,defaultValues});
  const {register,handleSubmit,watch,setValue,formState,reset}=form;
  const v=watch(); const settings=v.settings;
  const {data:me}=useMe(); const qc=useQueryClient();
  const countFn=useServerFn(recipientSummary);
  const [device,setDevice]=useState<"desktop"|"mobile">("desktop");
  const [preview,setPreview]=useState(true); const [publishOpen,setPublishOpen]=useState(false);
  const [configOpen,setConfigOpen]=useState(false); const [configName,setConfigName]=useState("");
  const [find,setFind]=useState(""); const [replace,setReplace]=useState(""); const [offerSearch,setOfferSearch]=useState("");
  const lists=useQuery({queryKey:["lists","builder"],queryFn:async()=>{const {data,error}=await supabase.from("email_lists").select("id,name,is_active").eq("is_archived",false).order("name");if(error)throw error;return data;}});
  const offers=useQuery({queryKey:["offers","builder"],queryFn:async()=>{const {data,error}=await supabase.from("offers").select("id,name,status,countries,tracking_url,description,sponsor_id").eq("imported",true).order("name");if(error)throw error;return data;}});
  const domains=useQuery({queryKey:["domains","builder"],queryFn:async()=>{const {data,error}=await supabase.from("domains").select("name,status,checks");if(error)throw error;return data;}});
  const configs=useQuery({queryKey:["campaign-configs"],queryFn:async()=>{const {data,error}=await supabase.from("saved_message_configs").select("*").order("updated_at",{ascending:false});if(error)throw error;return data;}});
  const included=settings.included_lists.length?settings.included_lists:v.list_id?[v.list_id]:[];
  const summary=useQuery({queryKey:["recipient-summary",included,settings.excluded_lists,settings.country,settings.engagement_min],enabled:included.length>0,queryFn:async()=>await countFn({data:{included,excluded:settings.excluded_lists,country:settings.country,engagement:settings.engagement_min}}) as RecipientSummary});
  const verified=(domains.data??[]).some(d=>d.name.toLowerCase()===v.from_email.split("@")[1]?.toLowerCase() && d.status==="verified");
  const issues=validateHtml(v.html_content);
  const checks=publicationChecks(v,summary.data?.final??0,verified);
  const admin=me?.roles.some(r=>["admin","super_admin"].includes(r));
  const field=(name:keyof CampaignValues,label:string,props:React.ComponentProps<typeof Input>={})=><div className="space-y-1"><Label htmlFor={name} className="text-xs">{label}</Label><Input id={name} {...register(name)} {...props}/>{formState.errors[name]&&<p className="text-xs text-destructive">{String(formState.errors[name]?.message)}</p>}</div>;
  const sf=(name: keyof CampaignValues["settings"],label:string,props:React.ComponentProps<typeof Input>={})=><div className="space-y-1"><Label htmlFor={`settings.${name}`} className="text-xs">{label}</Label><Input id={`settings.${name}`} {...register(`settings.${name}` as never)} {...props}/></div>;
  const select=(name:keyof CampaignValues["settings"],label:string,options:string[])=><div className="space-y-1"><Label className="text-xs">{label}</Label><Select value={String(settings[name])} onValueChange={value=>setValue(`settings.${name}` as never,value as never,{shouldDirty:true})}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{options.map(x=><SelectItem key={x} value={x}>{x.replaceAll("_"," ")}</SelectItem>)}</SelectContent></Select></div>;
  const toggle=(name:keyof CampaignValues,label:string)=><label className="flex items-center justify-between gap-3 text-xs">{label}<Switch checked={Boolean(v[name])} onCheckedChange={x=>setValue(name,x as never,{shouldDirty:true})}/></label>;
  function changeList(id:string,exclude:boolean,checked:boolean) {const key=exclude?"excluded_lists":"included_lists"; const current=exclude?settings.excluded_lists:included;const next=checked?[...new Set([...current,id])]:current.filter(x=>x!==id);setValue(`settings.${key}`,next,{shouldDirty:true});if(!exclude)setValue("list_id",next[0]??"",{shouldValidate:true});}
  async function saveConfig(id?:string, name=configName) {if(!name.trim())return;const row={name:name.trim(),configuration:JSON.parse(JSON.stringify(v)),updated_at:new Date().toISOString()};const {error}=id?await supabase.from("saved_message_configs").update(row).eq("id",id):await supabase.from("saved_message_configs").insert(row);if(error){toast.error(error.message);return;}qc.invalidateQueries({queryKey:["campaign-configs"]});toast.success("Configuration saved");setConfigName("");}
  async function save(values:CampaignValues) {try { await onSubmit(values); } catch { /* Caller reports the save failure. */ }}
  const checklistLabels:Record<string,string>={name:"Campaign name",recipients:"Sendable recipients",subject:"Subject",sender:"Valid sender",domain:"Verified domain · SPF / DKIM / DMARC",bounce:"Bounce address",content:"Message content",unsubscribe:"Active unsubscribe link",server:"Connected sending server",interface:"Available interface",queue:"Connected delivery queue"};
  return <form onSubmit={handleSubmit(save,()=>toast.error("Complete the required fields highlighted in the editor."))} className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
      <label className="flex items-center gap-2 text-sm"><Switch checked={settings.test_mode} onCheckedChange={x=>setValue("settings.test_mode",x,{shouldDirty:true})}/>{t("campaign.test")}</label>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={()=>setConfigOpen(true)}><FolderOpen className="h-4 w-4"/>{t("campaign.configs")}</Button><Button type="submit" variant="secondary" size="sm" disabled={formState.isSubmitting}><Save className="h-4 w-4"/>{submitLabel}</Button>{me?.can("campaigns","publish")&&<Button type="button" size="sm" onClick={()=>setPublishOpen(true)}><Send className="h-4 w-4"/>{t("campaign.publish")}</Button>}</div>
    </div>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)_minmax(0,0.9fr)]">
      <div className="min-w-0 space-y-5">
        <Section title={t("campaign.general")}>
          {field("name","Internal name")}{sf("description","Description")}
          <div className="grid grid-cols-2 gap-3">{select("campaign_type","Campaign type",["newsletter","promotion","transactional","autoresponder","ab_test","follow_up","reactivation"])}{field("timezone","Timezone")}</div>
          <div className="space-y-1"><Label className="text-xs">Owner</Label><Input value={settings.owner_id || me?.profile?.full_name || me?.user.email || ""} readOnly/></div>
        </Section>
        <Section title={t("campaign.offer")}>
          <Input placeholder="Search imported offers…" value={offerSearch} onChange={e=>setOfferSearch(e.target.value)}/>
          <Select value={settings.offer_id||"none"} onValueChange={id=>{const o=offers.data?.find(x=>x.id===id);setValue("settings.offer_id",id==="none"?"":id,{shouldDirty:true});setValue("offer",o?.name.slice(0,100)??"",{shouldDirty:true});}}><SelectTrigger aria-label="Partner offer"><SelectValue placeholder="Select an offer"/></SelectTrigger><SelectContent><SelectItem value="none">No partner offer</SelectItem>{(offers.data??[]).filter(o=>o.name.toLowerCase().includes(offerSearch.toLowerCase())).map(o=><SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select>
          {offers.isError&&<p className="text-xs text-destructive">Offers could not be loaded.</p>}
          {settings.offer_id&&<div className="text-xs text-muted-foreground">{offers.data?.find(o=>o.id===settings.offer_id)?.countries.join(", ")||"No country restriction provided"}<Button type="button" size="sm" variant="ghost" onClick={()=>{const o=offers.data?.find(x=>x.id===settings.offer_id);if(o?.tracking_url)setValue("html_content",`${v.html_content}\n<p><a href="${o.tracking_url.replaceAll('"',"&quot;")}">${o.name.replaceAll("<","&lt;")}</a></p>`,{shouldDirty:true});}}>Insert tracking link</Button></div>}
        </Section>
        <Section title={t("campaign.include")}>
          <div className="max-h-40 space-y-2 overflow-y-auto">{(lists.data??[]).filter(l=>l.is_active).map(l=><label key={l.id} className="flex items-center gap-2 text-xs"><Checkbox checked={included.includes(l.id)} onCheckedChange={x=>changeList(l.id,false,x===true)}/>{l.name}</label>)}</div>
          {formState.errors.list_id&&<p className="text-xs text-destructive">Choose at least one list.</p>}
          {lists.isError&&<p className="text-xs text-destructive">Lists could not be loaded.</p>}
          <h3 className="pt-2 text-xs font-semibold">{t("campaign.exclude")}</h3><div className="max-h-28 space-y-2 overflow-y-auto">{(lists.data??[]).map(l=><label key={l.id} className="flex items-center gap-2 text-xs"><Checkbox checked={settings.excluded_lists.includes(l.id)} onCheckedChange={x=>changeList(l.id,true,x===true)}/>{l.name}</label>)}</div>
          <div className="grid grid-cols-2 gap-3">{sf("country","Country")}{sf("engagement_min","Minimum engagement",{type:"number",min:0,max:100})}</div>
          <div className="border-t pt-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold">{t("campaign.recipients")}</h3><Button type="button" size="icon" variant="ghost" aria-label="Recount recipients" className="h-6 w-6" onClick={()=>summary.refetch()}><RefreshCw className="h-3 w-3"/></Button></div>{summary.isError?<p className="text-xs text-destructive">{t("campaign.countUnavailable")}</p>:<dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">{["raw","duplicates","unsubscribed","bounces","complaints","blocked","invalid","excluded","final"].map(key=><div key={key} className={`flex justify-between gap-2 ${key==="final"?"col-span-2 mt-2 border-t pt-2 font-semibold text-primary":"text-muted-foreground"}`}><dt className="capitalize">{key==="final"?"Sendable":key}</dt><dd>{summary.isFetching?"…":summary.data?.[key as keyof RecipientSummary]??0}</dd></div>)}</dl>}</div>
        </Section>
        <Section title={t("campaign.smart")}>
          {select("smart_mode","Routing mode",["disabled","geography","device"])}
          {settings.smart_mode!=="disabled"&&<>{settings.smart_rules.map((rule,i)=><div key={i} className="flex flex-wrap gap-2"><Input aria-label={`Rule ${i+1} country or device`} className="w-24" {...register(`settings.smart_rules.${i}.key`)} placeholder={settings.smart_mode==="geography"?"FR":"mobile"}/><Input aria-label={`Rule ${i+1} URL`} className="min-w-0 flex-1" {...register(`settings.smart_rules.${i}.url`)} placeholder="https://…"/><Button type="button" variant="ghost" size="icon" aria-label="Remove routing rule" onClick={()=>setValue("settings.smart_rules",settings.smart_rules.filter((_,n)=>n!==i),{shouldDirty:true})}><Trash2 className="h-3 w-3"/></Button></div>)}<Button type="button" size="sm" variant="outline" onClick={()=>setValue("settings.smart_rules",[...settings.smart_rules,{key:"",url:"",priority:settings.smart_rules.length}],{shouldDirty:true})}><Plus className="h-3 w-3"/>Add rule</Button>{sf("smart_fallback","Fallback URL")}</>}
        </Section>
      </div>
      <div className="min-w-0 space-y-5 xl:border-x xl:px-5">
        <Section title={t("campaign.message")}>
          <div className="grid gap-3 sm:grid-cols-2">{sf("bounce_email","Bounce / Return-path",{type:"email"})}{field("from_name","From name")}{field("from_email","From email",{type:"email"})}{field("reply_to","Reply-to",{type:"email"})}</div>
          <p className={`flex items-center gap-1 text-xs ${verified?"text-success":"text-warning-foreground dark:text-warning"}`}>{verified?<CheckCircle2 className="h-3 w-3"/>:<AlertTriangle className="h-3 w-3"/>}{verified?"Sender domain verified":"Sender domain not verified"}</p>
          {field("subject","Subject")}<div className="flex justify-between text-xs text-muted-foreground"><span>{v.subject.length}/200</span><span>{v.subject.length>60?"Long subject":v.subject.length>0?"Standard length":"Empty subject"}</span></div>{field("preheader","Pre-header")}
          <div className="border-l-2 border-primary bg-muted/50 p-3"><p className="text-xs font-medium">{v.from_name||"Sender"}</p><p className="truncate text-sm font-semibold">{renderCampaignPreview(v.subject)}</p><p className="truncate text-xs text-muted-foreground">{v.preheader||"Pre-header"}</p></div>
          <div className="grid grid-cols-3 gap-2">{select("content_type","Content type",["html","text","multipart"])}{select("charset","Charset",["UTF-8","ISO-8859-1"])}{select("encoding","Encoding",["quoted-printable","base64","8bit"])}</div>
          <Label className="text-xs">{t("campaign.headers")}</Label><Textarea {...register("settings.headers")} spellCheck={false} className="min-h-28 font-mono text-xs"/>
        </Section>
        <Section title={t("campaign.html")} action={<label className="flex cursor-pointer items-center gap-1 text-xs text-primary"><Upload className="h-3 w-3"/>Import HTML<input type="file" accept=".html,.htm,text/html" className="hidden" onChange={async e=>{const f=e.target.files?.[0];if(f){if(f.size>500000){toast.error("HTML file exceeds 500 KB");return;}setValue("html_content",await f.text(),{shouldDirty:true});}}}/></label>}>
          <Textarea {...register("html_content")} spellCheck={false} className="min-h-[300px] font-mono text-xs" aria-label="HTML creative"/>
          <div className="flex gap-2"><Input aria-label="Find text" placeholder="Find…" value={find} onChange={e=>setFind(e.target.value)}/><Input aria-label="Replace text" placeholder="Replace…" value={replace} onChange={e=>setReplace(e.target.value)}/><Button type="button" variant="outline" size="icon" aria-label="Replace all" title="Replace all" disabled={!find} onClick={()=>setValue("html_content",v.html_content.replaceAll(find,replace),{shouldDirty:true})}><Search className="h-4 w-4"/></Button></div>
          <div className="space-y-1 text-xs">{issues.length?issues.map(issue=><p key={issue} className="text-warning-foreground dark:text-warning">{issue}</p>):<p className="flex gap-1 text-success"><CheckCircle2 className="h-3 w-3"/>Links, variables and unsubscribe checked</p>}<details className="text-muted-foreground"><summary className="cursor-pointer">Variables</summary><p className="mt-2 break-words font-mono">{KNOWN_VARS.map(x=>`[${x}]`).join(" ")}</p></details></div>
        </Section>
        <Section title={t("campaign.preview")} action={<div className="flex items-center gap-1"><Switch aria-label="Enable preview" checked={preview} onCheckedChange={setPreview}/><Button type="button" size="icon" className="h-7 w-7" variant={device==="desktop"?"secondary":"ghost"} aria-label="Desktop preview" onClick={()=>setDevice("desktop")}><Monitor className="h-3 w-3"/></Button><Button type="button" size="icon" className="h-7 w-7" variant={device==="mobile"?"secondary":"ghost"} aria-label="Mobile preview" onClick={()=>setDevice("mobile")}><Smartphone className="h-3 w-3"/></Button><Button type="button" size="icon" className="h-7 w-7" variant="ghost" aria-label="Download preview" onClick={()=>download("campaign-preview.html",renderCampaignPreview(v.html_content))}><Download className="h-3 w-3"/></Button></div>}>
          {preview&&<div className="flex min-w-0 justify-center bg-muted p-2"><iframe title="Campaign preview" sandbox="" srcDoc={renderCampaignPreview(v.html_content,{subject:v.subject,from_name:v.from_name,from_email:v.from_email,offer_name:v.offer??""})} className={`h-[360px] max-w-full border bg-card ${device==="desktop"?"w-full":"w-[375px]"}`}/></div>}
          <Tabs defaultValue="text"><TabsList><TabsTrigger value="text">{t("campaign.text")}</TabsTrigger><TabsTrigger value="ab">{t("campaign.variants")}</TabsTrigger></TabsList><TabsContent value="text"><Textarea {...register("text_content")} className="min-h-28 font-mono text-xs" aria-label="Text version"/></TabsContent><TabsContent value="ab"><div className="space-y-2">{sf("alternate_subject","Subject B")}<Textarea {...register("settings.alternate_html")} placeholder="HTML version B" className="min-h-32 font-mono text-xs"/></div></TabsContent></Tabs>
        </Section>
      </div>
      <div className="min-w-0 space-y-5">
        <Section title={t("campaign.delivery")}><div className="flex items-center gap-2 border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground dark:text-warning"><Unplug className="h-4 w-4 shrink-0"/>{t("campaign.disconnected")}</div>
          <h3 className="text-xs font-semibold">{t("campaign.servers")}</h3><div className="grid grid-cols-2 gap-3"><div className="min-h-24 border p-2"><p className="text-xs text-muted-foreground">Available · 0</p></div><div className="min-h-24 border p-2"><p className="text-xs text-muted-foreground">Selected · 0</p></div></div><h3 className="text-xs font-semibold">{t("campaign.interfaces")}</h3><div className="flex min-h-20 items-center justify-center border text-xs text-muted-foreground"><Server className="mr-2 h-4 w-4"/>No connected interface</div>
          {field("server_pool","Requested pool",{disabled:!admin})}
        </Section>
        <Section title="Schedule"><div className="space-y-3">{field("scheduled_at","Start at",{type:"datetime-local"})}{sf("scheduled_end","End at",{type:"datetime-local"})}<p className="text-xs text-muted-foreground">Timezone · {v.timezone}</p>{v.scheduled_at&&<p className="break-words font-mono text-xs text-muted-foreground">UTC · {new Date(v.scheduled_at).toISOString()}</p>}</div></Section>
        <Section title={t("campaign.realtime")}>
          {field("send_speed","Maximum messages / hour",{type:"number",disabled:!admin})}{field("daily_limit","Maximum messages / day (0 = unlimited)",{type:"number",disabled:!admin})}
          {([['interface_every','Change interface every N messages'],['message_delay','Message delay (ms)'],['minute_limit','Maximum messages / minute'],['batch_size','Batch size'],['batch_pause','Pause between batches (seconds)']] as const).map(([key,label])=><div key={key} className="space-y-1"><Label className="text-xs">{label}</Label><Input type="number" disabled={!admin} {...register(`settings.delivery.${key}`)}/></div>)}
        </Section>
        <Section title={t("campaign.tracking")}>
          {toggle("track_opens","Track opens")}{toggle("track_clicks","Track clicks")}{toggle("track_conversions","Track conversions")}{toggle("handle_unsubscribes","Handle unsubscribes")}{toggle("handle_bounces","Handle bounces")}{toggle("use_global_suppression","Global suppression")}
          {sf("tracking_domain","Tracking domain")}{sf("url_suffix","URL suffix")}
          <div className="grid grid-cols-2 gap-2">{select("footer_size","Footer size",["small","medium","large"])}{select("footer_language","Footer language",["en","fr"])}</div>{sf("postal_address","Postal address")}{sf("legal_text","Legal text")}
          <Button type="button" variant="outline" size="sm" onClick={()=>{const legal=[settings.postal_address,settings.legal_text].filter(Boolean).join(" · ").replaceAll("<","&lt;");setValue("html_content",`${v.html_content}\n<footer><p>${legal}</p><a href="{{unsubscribe_url}}">${settings.footer_language==="fr"?"Se désabonner":"Unsubscribe"}</a></footer>`,{shouldDirty:true});}}>Insert footer</Button>
        </Section>
        <Section title="Redirection"><label className="flex items-center justify-between text-xs">Enabled<Switch checked={settings.redirect_enabled} onCheckedChange={x=>setValue("settings.redirect_enabled",x,{shouldDirty:true})}/></label>{sf("redirect_url","Destination URL")}{sf("redirect_fallback","Fallback URL")}</Section>
        <Section title={t("campaign.checklist")}><ul className="space-y-2 text-xs">{checks.map(c=><li key={c.key} className={`flex items-start gap-2 ${c.ok?"text-success":"text-muted-foreground"}`}>{c.ok?<CheckCircle2 className="h-3.5 w-3.5 shrink-0"/>:<AlertTriangle className="h-3.5 w-3.5 shrink-0"/>}{checklistLabels[c.key]}</li>)}</ul></Section>
      </div>
    </div>
    <Dialog open={publishOpen} onOpenChange={setPublishOpen}><DialogContent><DialogHeader><DialogTitle>{t("campaign.checklist")}</DialogTitle></DialogHeader><ul className="space-y-2 text-sm">{checks.map(c=><li key={c.key} className="flex items-center gap-2">{c.ok?<CheckCircle2 className="h-4 w-4 text-success"/>:<AlertTriangle className="h-4 w-4 text-destructive"/>}{checklistLabels[c.key]}</li>)}</ul><p className="text-sm text-warning-foreground dark:text-warning">{t("campaign.disconnected")}. Publication is blocked; no job will be created.</p><DialogFooter><Button type="button" variant="secondary" onClick={()=>setPublishOpen(false)}>Close</Button><Button type="button" disabled><Send className="h-4 w-4"/>Publish</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={configOpen} onOpenChange={setConfigOpen}><DialogContent><DialogHeader><DialogTitle>{t("campaign.configs")}</DialogTitle></DialogHeader><div className="flex gap-2"><Input aria-label="Configuration name" placeholder="Configuration name" value={configName} onChange={e=>setConfigName(e.target.value)} maxLength={120}/><Button type="button" disabled={!configName.trim()} onClick={()=>saveConfig()}><Save className="h-4 w-4"/>Save</Button></div><ul className="max-h-80 divide-y overflow-y-auto">{configs.isError&&<li className="py-3 text-sm text-destructive">Configurations could not be loaded.</li>}{!configs.data?.length&&<li className="py-3 text-sm text-muted-foreground">No saved configurations</li>}{configs.data?.map(c=><li key={c.id} className="flex items-center justify-between gap-2 py-2"><span className="truncate text-sm">{c.name}</span><div className="flex gap-1"><Button type="button" size="sm" variant="outline" onClick={()=>{const parsed=campaignSchema.safeParse(c.configuration);if(!parsed.success){toast.error("Invalid configuration");return;}reset(parsed.data);setConfigOpen(false);}}>Load</Button><Button type="button" size="icon" variant="ghost" aria-label={`Update ${c.name}`} onClick={()=>{saveConfig(c.id,c.name);}}><Save className="h-3 w-3"/></Button><Button type="button" size="icon" variant="ghost" aria-label={`Delete ${c.name}`} onClick={async()=>{const {error}=await supabase.from("saved_message_configs").delete().eq("id",c.id);if(error)toast.error(error.message);else qc.invalidateQueries({queryKey:["campaign-configs"]});}}><Trash2 className="h-3 w-3"/></Button></div></li>)}</ul></DialogContent></Dialog>
  </form>;
}
export function toRow(v:CampaignValues) {
  return {...v,settings:JSON.parse(JSON.stringify(v.settings)),preheader:v.preheader||null,reply_to:v.reply_to||null,offer:v.offer||null,text_content:v.text_content||null,server_pool:v.server_pool||null,daily_limit:v.daily_limit||null,scheduled_at:v.scheduled_at?new Date(v.scheduled_at).toISOString():null};
}
