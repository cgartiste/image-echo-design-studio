import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nextStatus, type CampaignStatus } from "./campaign-status";

export const recipientSummary = createServerFn({ method:"POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ included:z.array(z.string().uuid()).max(100),excluded:z.array(z.string().uuid()).max(100),country:z.string().max(100),engagement:z.number().min(0).max(100) }))
  .handler(async ({ data,context }) => {
    const { data:result,error }= await context.supabase.rpc("campaign_recipient_summary",{included:data.included,excluded:data.excluded,country_filter:data.country,engagement_min:data.engagement});
    if(error) throw new Error(error.message);
    return result;
  });
export const cloneCampaign = createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
  .inputValidator(z.object({id:z.string().uuid()})).handler(async({data,context})=>{
    const {data:id,error}=await context.supabase.rpc("clone_campaign",{source_id:data.id});
    if(error) throw new Error(error.message); return {id};
  });
export const commandCampaign = createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
  .inputValidator(z.object({id:z.string().uuid(),action:z.enum(["schedule","start","pause","resume","stop","cancel","archive"])}))
  .handler(async({data,context})=>{
    const permission=data.action==="schedule"?"publish":data.action;
    const {data:allowed,error:permissionError}=await context.supabase.rpc("has_permission",{_module:"campaigns",_action:permission});
    if(permissionError || !allowed) throw new Error("Permission denied");
    const {data:c,error}=await context.supabase.from("campaigns").select("status").eq("id",data.id).single();
    if(error) throw new Error(error.message);
    const status=nextStatus(c.status as CampaignStatus,data.action);
    // The database guard re-checks permissions, verified sender domain, unsubscribe link and an online KumoMTA server.
    const {data:updated,error:updateError}=await context.supabase.from("campaigns").update({status}).eq("id",data.id).eq("status",c.status).select("id").single();
    if(updateError || !updated) throw new Error(updateError?.message ?? "Campaign changed; refresh and retry");
    let queued=0;
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    if(data.action==="start"){
      const {data:n,error:qErr}=await context.supabase.rpc("enqueue_campaign",{cid:data.id});
      if(qErr) throw new Error(qErr.message);
      queued=n??0;
      await supabaseAdmin.from("campaigns").update({started_at:new Date().toISOString()}).eq("id",data.id).is("started_at",null);
      await supabaseAdmin.from("campaign_logs").insert({campaign_id:data.id,level:"info",message:`${queued} messages queued for KumoMTA`,actor_id:context.userId,action:"enqueue"});
    }
    if(data.action==="stop"||data.action==="cancel"){
      await supabaseAdmin.from("send_jobs").update({status:"cancelled"}).eq("campaign_id",data.id).eq("status","queued");
      await supabaseAdmin.from("campaigns").update({ended_at:new Date().toISOString()}).eq("id",data.id);
    }
    return {status,queued};
  });

/** Queues test messages to the given addresses; any online KumoMTA server in the campaign pool sends them. */
export const sendCampaignTest = createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
  .inputValidator(z.object({id:z.string().uuid(),emails:z.array(z.string().trim().toLowerCase().email()).min(1).max(20)}))
  .handler(async({data,context})=>{
    const {data:allowed}=await context.supabase.rpc("has_permission",{_module:"campaigns",_action:"send_test"});
    if(!allowed) throw new Error("Permission denied");
    const {data:c,error}=await context.supabase.from("campaigns").select("id,server_pool").eq("id",data.id).single();
    if(error) throw new Error(error.message);
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const pool=c.server_pool||"default";
    const {data:servers}=await supabaseAdmin.from("mta_servers").select("id,last_seen_at,kumo_active,paused").eq("pool",pool);
    const {isOnline}=await import("./kumo-config");
    if(!(servers??[]).some(s=>s.kumo_active&&!s.paused&&isOnline(s.last_seen_at))) throw new Error(`No online KumoMTA server in pool "${pool}"`);
    const {error:insErr}=await supabaseAdmin.from("send_jobs").insert(data.emails.map(email=>({campaign_id:data.id,email,is_test:true})));
    if(insErr) throw new Error(insErr.message);
    await supabaseAdmin.from("campaign_logs").insert({campaign_id:data.id,level:"info",message:`Test queued to ${data.emails.length} address(es)`,actor_id:context.userId,action:"send_test"});
    return {queued:data.emails.length};
  });
