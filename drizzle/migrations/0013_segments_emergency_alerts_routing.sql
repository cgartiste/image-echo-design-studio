CREATE TABLE public.segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_count integer,
  last_counted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.segments TO authenticated;
GRANT ALL ON public.segments TO service_role;
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seg read" ON public.segments FOR SELECT TO authenticated USING (public.has_permission('lists','view'));
CREATE POLICY "seg add" ON public.segments FOR INSERT TO authenticated WITH CHECK (public.has_permission('lists','create') AND created_by = auth.uid());
CREATE POLICY "seg edit" ON public.segments FOR UPDATE TO authenticated USING (public.has_permission('lists','edit')) WITH CHECK (public.has_permission('lists','edit'));
CREATE POLICY "seg remove" ON public.segments FOR DELETE TO authenticated USING (public.has_permission('lists','delete'));

-- One rule evaluator shared by counts and the send queue.
CREATE OR REPLACE FUNCTION public.segment_match(s public.subscribers, r jsonb) RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    (jsonb_array_length(coalesce(r->'lists','[]')) = 0 OR s.list_id::text IN (SELECT jsonb_array_elements_text(r->'lists')))
    AND (jsonb_array_length(coalesce(r->'countries','[]')) = 0 OR upper(coalesce(s.country,'')) IN (SELECT upper(jsonb_array_elements_text(r->'countries'))))
    AND (jsonb_array_length(coalesce(r->'languages','[]')) = 0 OR lower(coalesce(s.language,'')) IN (SELECT lower(jsonb_array_elements_text(r->'languages'))))
    AND (jsonb_array_length(coalesce(r->'tags_any','[]')) = 0 OR s.tags && ARRAY(SELECT jsonb_array_elements_text(r->'tags_any')))
    AND (jsonb_array_length(coalesce(r->'tags_none','[]')) = 0 OR NOT (s.tags && ARRAY(SELECT jsonb_array_elements_text(r->'tags_none'))))
    AND (r->>'engagement_min' IS NULL OR s.engagement >= (r->>'engagement_min')::int)
    AND (r->>'engagement_max' IS NULL OR s.engagement <= (r->>'engagement_max')::int)
    AND (r->>'opened_within_days' IS NULL OR s.last_open_at >= now() - make_interval(days => (r->>'opened_within_days')::int))
    AND (r->>'clicked_within_days' IS NULL OR s.last_click_at >= now() - make_interval(days => (r->>'clicked_within_days')::int))
    AND (r->>'inactive_days' IS NULL OR coalesce(greatest(s.last_open_at, s.last_click_at), s.subscribed_at) < now() - make_interval(days => (r->>'inactive_days')::int))
    AND (r->>'not_sent_within_days' IS NULL OR s.last_sent_at IS NULL OR s.last_sent_at < now() - make_interval(days => (r->>'not_sent_within_days')::int))
    AND (r->>'subscribed_within_days' IS NULL OR s.subscribed_at >= now() - make_interval(days => (r->>'subscribed_within_days')::int))
    AND (coalesce((r->>'max_bounces')::int, 999999) >= s.bounce_count)
$$;

CREATE OR REPLACE FUNCTION public.segment_count(rules jsonb) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT public.has_permission('lists','view') THEN RAISE EXCEPTION 'Permission denied'; END IF;
  SELECT count(DISTINCT lower(trim(s.email))) INTO n FROM public.subscribers s
  WHERE s.status = 'active' AND NOT s.unsubscribed AND NOT s.blocked
    AND NOT EXISTS (SELECT 1 FROM public.suppressions g WHERE g.email = lower(trim(s.email)))
    AND public.segment_match(s, rules);
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.segment_count(jsonb) TO authenticated;

-- Global emergency stop + alerts.
CREATE TABLE public.system_controls (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  emergency_stop boolean NOT NULL DEFAULT false,
  reason text,
  changed_by uuid,
  changed_at timestamptz,
  bounce_threshold numeric NOT NULL DEFAULT 5,
  complaint_threshold numeric NOT NULL DEFAULT 0.1
);
INSERT INTO public.system_controls (id) VALUES (true);
GRANT SELECT ON public.system_controls TO authenticated;
GRANT ALL ON public.system_controls TO service_role;
ALTER TABLE public.system_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "controls read" ON public.system_controls FOR SELECT TO authenticated USING (true);

CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'warning' CHECK (level IN ('info','warning','critical')),
  source text NOT NULL,
  ref_id uuid,
  message text NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alerts_open_idx ON public.alerts(created_at DESC) WHERE resolved_at IS NULL;
GRANT SELECT ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts read" ON public.alerts FOR SELECT TO authenticated USING (public.has_permission('servers','view'));

-- SES routing: order and live usage per account.
ALTER TABLE public.provider_accounts
  ADD COLUMN IF NOT EXISTS routing_priority integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS sent_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_send_rate numeric,
  ADD COLUMN IF NOT EXISTS bounce_rate numeric,
  ADD COLUMN IF NOT EXISTS complaint_rate numeric,
  ADD COLUMN IF NOT EXISTS production_access boolean;

CREATE TABLE public.routing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid,
  from_account uuid,
  to_account uuid,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.routing_events TO authenticated;
GRANT ALL ON public.routing_events TO service_role;
ALTER TABLE public.routing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routing read" ON public.routing_events FOR SELECT TO authenticated USING (public.has_permission('servers','view'));

-- Queue respects the emergency stop and campaign segments.
CREATE OR REPLACE FUNCTION public.enqueue_campaign(cid uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c record; inc uuid[]; exc uuid[]; ctry text; emin int; n int; seg jsonb;
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.has_permission('campaigns','start') THEN RAISE EXCEPTION 'Permission denied'; END IF;
 IF (SELECT emergency_stop FROM public.system_controls) THEN RAISE EXCEPTION 'Emergency stop is active — sending is frozen'; END IF;
 SELECT * INTO c FROM public.campaigns WHERE id = cid;
 IF c IS NULL THEN RAISE EXCEPTION 'Campaign not found'; END IF;
 SELECT coalesce(array_agg(x::uuid), '{}') INTO inc FROM jsonb_array_elements_text(coalesce(c.settings->'included_lists','[]'::jsonb)) x;
 IF array_length(inc,1) IS NULL AND c.list_id IS NOT NULL THEN inc := ARRAY[c.list_id]; END IF;
 SELECT coalesce(array_agg(x::uuid), '{}') INTO exc FROM jsonb_array_elements_text(coalesce(c.settings->'excluded_lists','[]'::jsonb)) x;
 ctry := coalesce(c.settings->>'country','');
 emin := coalesce((c.settings->>'engagement_min')::int, 0);
 IF nullif(c.settings->>'segment_id','') IS NOT NULL THEN
   SELECT rules INTO seg FROM public.segments WHERE id = (c.settings->>'segment_id')::uuid;
 END IF;
 INSERT INTO public.send_jobs(campaign_id, subscriber_id, email)
 SELECT DISTINCT ON (lower(trim(s.email))) cid, s.id, lower(trim(s.email))
 FROM public.subscribers s
 WHERE s.list_id = ANY(inc) AND s.status = 'active' AND NOT s.unsubscribed AND NOT s.blocked
   AND lower(trim(s.email)) ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
   AND (ctry = '' OR lower(coalesce(s.country,'')) = lower(ctry))
   AND s.engagement >= emin
   AND (seg IS NULL OR public.segment_match(s, seg))
   AND NOT EXISTS (SELECT 1 FROM public.subscribers e WHERE e.list_id = ANY(exc) AND lower(trim(e.email)) = lower(trim(s.email)))
   AND NOT EXISTS (SELECT 1 FROM public.subscribers b WHERE lower(trim(b.email)) = lower(trim(s.email)) AND (b.unsubscribed OR b.blocked OR b.status IN ('unsubscribed','blocked','bounced','hard_bounce','complaint','complained')))
   AND NOT EXISTS (SELECT 1 FROM public.suppressions g WHERE g.email = lower(trim(s.email)))
 ORDER BY lower(trim(s.email)), s.created_at
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n = ROW_COUNT;
 RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.claim_send_jobs(_server uuid, _limit integer)
 RETURNS SETOF send_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p text;
BEGIN
 IF (SELECT emergency_stop FROM public.system_controls) THEN RETURN; END IF;
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
END $function$;