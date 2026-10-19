CREATE TABLE public.mta_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  ip text NOT NULL,
  hostname text,
  pool text NOT NULL DEFAULT 'default',
  provider text,
  status text NOT NULL DEFAULT 'pending',
  agent_token_hash text NOT NULL UNIQUE,
  agent_token_enc text NOT NULL,
  kumo_installed boolean NOT NULL DEFAULT false,
  kumo_active boolean NOT NULL DEFAULT false,
  kumo_version text,
  system jsonb NOT NULL DEFAULT '{}'::jsonb,
  ports jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ses_account_id uuid REFERENCES public.provider_accounts(id) ON DELETE SET NULL,
  paused boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mta_servers TO authenticated;
GRANT ALL ON public.mta_servers TO service_role;
ALTER TABLE public.mta_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "servers view" ON public.mta_servers FOR SELECT TO authenticated USING (public.has_permission('servers','view'));
CREATE POLICY "servers create" ON public.mta_servers FOR INSERT TO authenticated WITH CHECK (public.has_permission('servers','create'));
CREATE POLICY "servers edit" ON public.mta_servers FOR UPDATE TO authenticated USING (public.has_permission('servers','edit')) WITH CHECK (public.has_permission('servers','edit'));
CREATE POLICY "servers delete" ON public.mta_servers FOR DELETE TO authenticated USING (public.has_permission('servers','delete'));

CREATE TABLE public.server_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.mta_servers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  output text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX server_commands_server_idx ON public.server_commands(server_id, status, created_at);
GRANT SELECT, INSERT ON public.server_commands TO authenticated;
GRANT ALL ON public.server_commands TO service_role;
ALTER TABLE public.server_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commands view" ON public.server_commands FOR SELECT TO authenticated USING (public.has_permission('servers','view'));
CREATE POLICY "commands create" ON public.server_commands FOR INSERT TO authenticated WITH CHECK (
  public.has_permission('servers','execute') AND status = 'queued' AND created_by = auth.uid()
  AND (kind <> 'shell' OR public.has_role(auth.uid(),'super_admin'))
  AND kind IN ('install_kumomta','apply_config','start_kumomta','stop_kumomta','restart_kumomta','system_info','check_ports','tail_logs','queue_summary','open_port','update_agent','shell'));

CREATE TABLE public.send_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  subscriber_id uuid REFERENCES public.subscribers(id) ON DELETE SET NULL,
  email text NOT NULL,
  is_test boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  server_id uuid REFERENCES public.mta_servers(id) ON DELETE SET NULL,
  variant text,
  error text,
  claimed_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX send_jobs_campaign_email_uniq ON public.send_jobs(campaign_id, lower(email)) WHERE NOT is_test;
CREATE INDEX send_jobs_queue_idx ON public.send_jobs(status, campaign_id, created_at);
GRANT SELECT ON public.send_jobs TO authenticated;
GRANT ALL ON public.send_jobs TO service_role;
ALTER TABLE public.send_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs view" ON public.send_jobs FOR SELECT TO authenticated USING (public.has_permission('campaigns','view'));

CREATE TABLE public.send_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.send_jobs(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  kind text NOT NULL,
  detail text,
  url text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX send_events_campaign_idx ON public.send_events(campaign_id, created_at DESC);
GRANT SELECT ON public.send_events TO authenticated;
GRANT ALL ON public.send_events TO service_role;
ALTER TABLE public.send_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events view" ON public.send_events FOR SELECT TO authenticated USING (public.has_permission('campaigns','view'));

-- Queue: build jobs from the campaign audience
CREATE OR REPLACE FUNCTION public.enqueue_campaign(cid uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; inc uuid[]; exc uuid[]; ctry text; emin int; n int;
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.has_permission('campaigns','start') THEN RAISE EXCEPTION 'Permission denied'; END IF;
 SELECT * INTO c FROM public.campaigns WHERE id = cid;
 IF c IS NULL THEN RAISE EXCEPTION 'Campaign not found'; END IF;
 SELECT coalesce(array_agg(x::uuid), '{}') INTO inc FROM jsonb_array_elements_text(coalesce(c.settings->'included_lists','[]'::jsonb)) x;
 IF array_length(inc,1) IS NULL AND c.list_id IS NOT NULL THEN inc := ARRAY[c.list_id]; END IF;
 SELECT coalesce(array_agg(x::uuid), '{}') INTO exc FROM jsonb_array_elements_text(coalesce(c.settings->'excluded_lists','[]'::jsonb)) x;
 ctry := coalesce(c.settings->>'country','');
 emin := coalesce((c.settings->>'engagement_min')::int, 0);
 INSERT INTO public.send_jobs(campaign_id, subscriber_id, email)
 SELECT DISTINCT ON (lower(trim(s.email))) cid, s.id, lower(trim(s.email))
 FROM public.subscribers s
 WHERE s.list_id = ANY(inc) AND s.status = 'active' AND NOT s.unsubscribed AND NOT s.blocked
   AND lower(trim(s.email)) ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
   AND (ctry = '' OR lower(coalesce(s.country,'')) = lower(ctry))
   AND s.engagement >= emin
   AND NOT EXISTS (SELECT 1 FROM public.subscribers e WHERE e.list_id = ANY(exc) AND lower(trim(e.email)) = lower(trim(s.email)))
   AND NOT EXISTS (SELECT 1 FROM public.subscribers b WHERE lower(trim(b.email)) = lower(trim(s.email)) AND (b.unsubscribed OR b.blocked OR b.status IN ('unsubscribed','blocked','bounced','hard_bounce','complaint','complained')))
 ORDER BY lower(trim(s.email)), s.created_at
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n = ROW_COUNT;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_campaign(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_campaign(uuid) TO authenticated, service_role;

-- Agents claim jobs atomically
CREATE OR REPLACE FUNCTION public.claim_send_jobs(_server uuid, _limit int) RETURNS SETOF public.send_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p text;
BEGIN
 SELECT pool INTO p FROM public.mta_servers WHERE id = _server AND NOT paused;
 IF p IS NULL THEN RETURN; END IF;
 RETURN QUERY
 UPDATE public.send_jobs j SET status = 'sending', server_id = _server, claimed_at = now(), attempts = j.attempts + 1
 WHERE j.id IN (
   SELECT q.id FROM public.send_jobs q JOIN public.campaigns c ON c.id = q.campaign_id
   WHERE (q.status = 'queued' OR (q.status = 'sending' AND q.claimed_at < now() - interval '10 minutes' AND q.attempts < 3))
     AND (q.is_test OR c.status = 'running')
     AND coalesce(nullif(c.server_pool,''),'default') = p
   ORDER BY q.is_test DESC, q.created_at
   LIMIT greatest(1, least(_limit, 1000))
   FOR UPDATE OF q SKIP LOCKED)
 RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_send_jobs(uuid,int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_send_jobs(uuid,int) TO service_role;

-- Delivery service may update statistics; user sessions keep all existing guards
CREATE OR REPLACE FUNCTION public.campaign_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a text; config_changed boolean;
BEGIN
 IF auth.uid() IS NULL THEN
  IF coalesce(auth.role(), current_user) IN ('service_role','postgres','supabase_admin') OR current_user IN ('service_role','postgres','supabase_admin') THEN
   IF TG_OP='DELETE' THEN RETURN OLD; END IF;
   NEW.updated_at:=now(); RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Authenticated campaign commands required';
 END IF;
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
   IF NEW.status::text IN ('scheduled','publishing','running') AND NOT EXISTS (
     SELECT 1 FROM public.mta_servers m WHERE m.status='online' AND m.kumo_active AND NOT m.paused AND m.pool = coalesce(nullif(NEW.server_pool,''),'default')) THEN
    RAISE EXCEPTION 'No online KumoMTA server in pool "%"', coalesce(nullif(NEW.server_pool,''),'default');
   END IF;
  END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;