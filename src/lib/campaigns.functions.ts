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
    if(["schedule","start","resume","pause","stop"].includes(data.action)) throw new Error("No sending service connected. No messages have been sent or changed.");
    const {data:c,error}=await context.supabase.from("campaigns").select("status").eq("id",data.id).single();
    if(error) throw new Error(error.message);
    const status=nextStatus(c.status as CampaignStatus,data.action);
    const {data:updated,error:updateError}=await context.supabase.from("campaigns").update({status}).eq("id",data.id).eq("status",c.status).select("id").single();
    if(updateError || !updated) throw new Error(updateError?.message ?? "Campaign changed; refresh and retry");
    return {status};
  });