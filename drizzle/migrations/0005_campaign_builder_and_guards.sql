ALTER TABLE public.campaigns ADD COLUMN settings jsonb NOT NULL DEFAULT '{}', ADD COLUMN recipient_count integer NOT NULL DEFAULT 0, ADD COLUMN started_at timestamptz, ADD COLUMN ended_at timestamptz;
ALTER TABLE public.campaign_logs ADD COLUMN actor_id uuid, ADD COLUMN action text, ADD COLUMN from_status text, ADD COLUMN to_status text;
CREATE TABLE public.saved_message_configs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, owner_id uuid NOT NULL DEFAULT auth.uid(), configuration jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_message_configs TO authenticated;
GRANT ALL ON public.saved_message_configs TO service_role;
ALTER TABLE public.saved_message_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY configs_read ON public.saved_message_configs FOR SELECT TO authenticated USING(owner_id=auth.uid() AND public.has_permission('campaigns','view'));
CREATE POLICY configs_insert ON public.saved_message_configs FOR INSERT TO authenticated WITH CHECK(owner_id=auth.uid() AND (public.has_permission('campaigns','create') OR public.has_permission('campaigns','edit')));
CREATE POLICY configs_update ON public.saved_message_configs FOR UPDATE TO authenticated USING(owner_id=auth.uid() AND public.has_permission('campaigns','edit')) WITH CHECK(owner_id=auth.uid());
CREATE POLICY configs_delete ON public.saved_message_configs FOR DELETE TO authenticated USING(owner_id=auth.uid() AND public.has_permission('campaigns','edit'));
CREATE OR REPLACE FUNCTION public.campaign_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a text; config_changed boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authenticated campaign commands required'; END IF;
 IF TG_OP='DELETE' THEN
  IF NOT public.has_permission('campaigns','delete') THEN RAISE EXCEPTION 'Permission denied'; END IF;
  IF OLD.status::text NOT IN ('draft','test','ready','waiting_approval','archived') AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) THEN RAISE EXCEPTION 'Administrator required for forced deletion'; END IF;
  IF OLD.status::text IN ('running','publishing','paused','stopping') THEN RAISE EXCEPTION 'Stop the campaign before deletion'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NOT public.has_permission('campaigns','create') THEN RAISE EXCEPTION 'Creation permission required'; END IF;
  IF NEW.status::text <> 'draft' THEN RAISE EXCEPTION 'New campaigns must be drafts'; END IF;
  NEW.created_by:=auth.uid(); NEW.sent:=0; NEW.delivered:=0; NEW.opens:=0; NEW.clicks:=0; NEW.bounces:=0; NEW.unsubscribes:=0; NEW.complaints:=0; NEW.conversions:=0; NEW.revenue:=0; NEW.cost:=0; NEW.started_at:=NULL; NEW.ended_at:=NULL;
 ELSE
  config_changed := (to_jsonb(NEW)-ARRAY['status','updated_at','recipient_count','started_at','ended_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','recipient_count','started_at','ended_at']);
  IF config_changed THEN
   IF NOT public.has_permission('campaigns','edit') THEN RAISE EXCEPTION 'Editing permission required'; END IF;
   IF OLD.status::text NOT IN ('draft','test','ready','waiting_approval') THEN RAISE EXCEPTION 'Campaign content is locked in this status'; END IF;
   IF (NEW.settings->'delivery') IS DISTINCT FROM (OLD.settings->'delivery') OR NEW.send_speed IS DISTINCT FROM OLD.send_speed OR NEW.daily_limit IS DISTINCT FROM OLD.daily_limit OR NEW.server_pool IS DISTINCT FROM OLD.server_pool THEN
    IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) THEN RAISE EXCEPTION 'Administrator required to change delivery limits or servers'; END IF;
   END IF;
  END IF;
  IF (to_jsonb(NEW)->'sent',to_jsonb(NEW)->'delivered',to_jsonb(NEW)->'opens',to_jsonb(NEW)->'clicks',to_jsonb(NEW)->'bounces',to_jsonb(NEW)->'unsubscribes',to_jsonb(NEW)->'complaints',to_jsonb(NEW)->'conversions',to_jsonb(NEW)->'revenue',to_jsonb(NEW)->'cost',NEW.started_at,NEW.ended_at) IS DISTINCT FROM (to_jsonb(OLD)->'sent',to_jsonb(OLD)->'delivered',to_jsonb(OLD)->'opens',to_jsonb(OLD)->'clicks',to_jsonb(OLD)->'bounces',to_jsonb(OLD)->'unsubscribes',to_jsonb(OLD)->'complaints',to_jsonb(OLD)->'conversions',to_jsonb(OLD)->'revenue',to_jsonb(OLD)->'cost',OLD.started_at,OLD.ended_at) THEN RAISE EXCEPTION 'Delivery statistics and timestamps are managed by the sending service'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
   a:= CASE
    WHEN NEW.status::text='scheduled' AND OLD.status::text IN ('draft','ready') THEN 'publish'
    WHEN NEW.status::text='ready' AND OLD.status::text='draft' THEN 'publish'
    WHEN NEW.status::text='publishing' AND OLD.status::text IN ('ready','scheduled') THEN 'start'
    WHEN NEW.status::text='running' AND OLD.status::text IN ('draft','ready','scheduled','publishing') THEN 'start'
    WHEN NEW.status::text='running' AND OLD.status::text='paused' THEN 'resume'
    WHEN NEW.status::text='paused' AND OLD.status::text='running' THEN 'pause'
    WHEN NEW.status::text='stopped' AND OLD.status::text IN ('running','paused','stopping') THEN 'stop'
    WHEN NEW.status::text='stopping' AND OLD.status::text IN ('running','paused') THEN 'stop'
    WHEN NEW.status::text='cancelled' AND OLD.status::text IN ('ready','scheduled','publishing','running','paused','waiting_approval') THEN 'cancel'
    WHEN NEW.status::text='archived' AND OLD.status::text IN ('draft','ready','test','stopped','completed','failed','cancelled') THEN 'archive'
    WHEN NEW.status::text='waiting_approval' AND OLD.status::text IN ('draft','test') THEN 'publish'
    WHEN NEW.status::text='test' AND OLD.status::text='draft' THEN 'edit'
    ELSE NULL END;
   IF a IS NULL THEN RAISE EXCEPTION 'Illegal campaign transition'; END IF;
   IF NOT public.has_permission('campaigns',a) THEN RAISE EXCEPTION 'Campaign action permission required: %',a; END IF;
   IF NEW.status::text IN ('ready','scheduled','publishing','running') THEN RAISE EXCEPTION 'No sending service connected. Publication and sending are unavailable.'; END IF;
  END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER campaign_operations_guard BEFORE INSERT OR UPDATE OR DELETE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.campaign_guard();
CREATE OR REPLACE FUNCTION public.campaign_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO public.campaign_logs(campaign_id,message,actor_id,action,to_status) VALUES(NEW.id,'Campaign created',auth.uid(),'create',NEW.status::text);
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
  INSERT INTO public.campaign_logs(campaign_id,message,actor_id,action,from_status,to_status) VALUES(NEW.id,'Status changed',auth.uid(),'status_change',OLD.status::text,NEW.status::text);
 ELSE
  INSERT INTO public.campaign_logs(campaign_id,message,actor_id,action) VALUES(NEW.id,'Configuration saved',auth.uid(),'edit');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER campaign_operations_audit AFTER INSERT OR UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.campaign_audit();
CREATE OR REPLACE FUNCTION public.campaign_recipient_summary(included uuid[], excluded uuid[] DEFAULT '{}', country_filter text DEFAULT '', engagement_min integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_permission('campaigns','view') OR NOT public.has_permission('lists','view') THEN RAISE EXCEPTION 'Recipient access denied'; END IF;
 WITH selected AS (SELECT s.*,lower(trim(s.email)) AS normalized FROM public.subscribers s WHERE s.list_id=ANY(included)),
 marked AS (SELECT *,CASE WHEN unsubscribed OR status='unsubscribed' THEN 'unsubscribed' WHEN status IN ('bounced','hard_bounce') THEN 'bounces' WHEN status IN ('complaint','complained') THEN 'complaints' WHEN blocked OR status='blocked' THEN 'blocked' WHEN normalized !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' THEN 'invalid' WHEN EXISTS(SELECT 1 FROM public.subscribers e WHERE e.list_id=ANY(excluded) AND lower(trim(e.email))=selected.normalized) OR (country_filter<>'' AND lower(coalesce(country,''))<>lower(country_filter)) OR engagement<engagement_min OR status<>'active' THEN 'excluded' ELSE 'eligible' END AS reason FROM selected),
 safe AS (SELECT DISTINCT normalized FROM marked m WHERE reason='eligible' AND NOT EXISTS(SELECT 1 FROM public.subscribers s WHERE lower(trim(s.email))=m.normalized AND (s.unsubscribed OR s.blocked OR s.status IN ('unsubscribed','blocked','bounced','hard_bounce','complaint','complained'))))
 SELECT jsonb_build_object('raw',count(*),'duplicates',count(*)-count(DISTINCT normalized),'unsubscribed',count(*) FILTER(WHERE reason='unsubscribed'),'bounces',count(*) FILTER(WHERE reason='bounces'),'complaints',count(*) FILTER(WHERE reason='complaints'),'blocked',count(*) FILTER(WHERE reason='blocked'),'invalid',count(*) FILTER(WHERE reason='invalid'),'excluded',count(*) FILTER(WHERE reason='excluded'),'final',(SELECT count(*) FROM safe)) INTO result FROM marked;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.campaign_recipient_summary(uuid[],uuid[],text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.campaign_recipient_summary(uuid[],uuid[],text,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.clone_campaign(source_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.campaigns; cloned_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_permission('campaigns','clone') OR NOT public.has_permission('campaigns','view') OR NOT public.has_permission('campaigns','create') THEN RAISE EXCEPTION 'Clone permission required'; END IF;
 SELECT * INTO s FROM public.campaigns WHERE id=source_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;
 INSERT INTO public.campaigns(name,subject,preheader,from_name,from_email,reply_to,list_id,offer,html_content,text_content,server_pool,send_speed,daily_limit,timezone,track_opens,track_clicks,track_conversions,handle_unsubscribes,handle_bounces,use_global_suppression,settings)
 VALUES(s.name||' (copy)',s.subject,s.preheader,s.from_name,s.from_email,s.reply_to,s.list_id,s.offer,s.html_content,s.text_content,s.server_pool,s.send_speed,s.daily_limit,s.timezone,s.track_opens,s.track_clicks,s.track_conversions,s.handle_unsubscribes,s.handle_bounces,s.use_global_suppression,s.settings-ARRAY['scheduled_end','redirect_published_url']) RETURNING id INTO cloned_id;
 RETURN cloned_id;
END $$;
REVOKE ALL ON FUNCTION public.clone_campaign(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clone_campaign(uuid) TO authenticated;