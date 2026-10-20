CREATE VIEW public.vip_recipients AS
WITH clicks AS (
 SELECT lower(trim(j.email)) AS email, j.campaign_id, j.clicked_at AS occurred_at, 'click'::text AS kind, j.id::text AS event_id, 0::numeric AS revenue
 FROM public.send_jobs j WHERE NOT j.is_test AND j.clicked_at IS NOT NULL
), purchases AS (
 SELECT DISTINCT lower(trim(j.email)) AS email, j.campaign_id, c.converted_at AS occurred_at, 'conversion'::text AS kind, c.id::text AS event_id, c.payout AS revenue
 FROM public.conversions c JOIN public.send_jobs j ON c.campaign_ref=j.campaign_id::text AND (lower(trim(c.subscriber_ref))=lower(trim(j.email)) OR c.subscriber_ref=j.subscriber_id::text)
 WHERE NOT j.is_test AND (j.sent_at IS NOT NULL OR j.clicked_at IS NOT NULL) AND c.converted_at >= COALESCE(j.sent_at,j.created_at)
), events AS (SELECT * FROM clicks UNION ALL SELECT * FROM purchases)
SELECT e.email, count(DISTINCT e.event_id) FILTER(WHERE e.kind='click') AS clicked_messages,
 count(DISTINCT e.event_id) FILTER(WHERE e.kind='conversion') AS conversions,
 coalesce(sum(e.revenue) FILTER(WHERE e.kind='conversion'),0) AS revenue,
 min(e.occurred_at) AS first_activity_at, max(e.occurred_at) AS last_activity_at,
 array_agg(DISTINCT c.name) AS campaigns
FROM events e JOIN public.campaigns c ON c.id=e.campaign_id
WHERE public.has_permission('vip','view') GROUP BY e.email;
REVOKE ALL ON public.vip_recipients FROM PUBLIC, anon;
GRANT SELECT ON public.vip_recipients TO authenticated, service_role;
COMMENT ON VIEW public.vip_recipients IS 'Automatically derived tracked recipients; conversions represent sponsor-reported outcomes, not necessarily confirmed purchases. No sending consent or SES assignment is granted.';