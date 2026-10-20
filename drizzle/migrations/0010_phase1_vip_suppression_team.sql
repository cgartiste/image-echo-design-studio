ALTER TABLE public.provider_accounts DROP CONSTRAINT IF EXISTS provider_accounts_provider_check;
ALTER TABLE public.provider_accounts ADD CONSTRAINT provider_accounts_provider_check CHECK (provider = ANY (ARRAY['cloudflare','godaddy','sav','hetzner','ovh','digitalocean','vultr','linode','aws_ses']));
ALTER TABLE public.provider_accounts
  ADD COLUMN IF NOT EXISTS is_vip boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pool_status text NOT NULL DEFAULT 'available' CHECK (pool_status IN ('available','assigned','maintenance','suspended','error','pending')),
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS daily_quota integer;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;

CREATE TABLE public.vip_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text NOT NULL,
  contact_name text,
  contact_email text,
  owner_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('active','pending','suspended','maintenance','archived')),
  allowed_domains text[] NOT NULL DEFAULT '{}',
  ses_account_id uuid REFERENCES public.provider_accounts(id) ON DELETE SET NULL,
  backup_account_id uuid REFERENCES public.provider_accounts(id) ON DELETE SET NULL,
  internal_quota integer,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX vip_clients_ses_unique ON public.vip_clients(ses_account_id) WHERE ses_account_id IS NOT NULL;
GRANT SELECT ON public.vip_clients TO authenticated;
GRANT ALL ON public.vip_clients TO service_role;
ALTER TABLE public.vip_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vip read" ON public.vip_clients FOR SELECT TO authenticated USING (public.has_permission('vip','view'));

CREATE OR REPLACE FUNCTION public.vip_pool_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_vip AND NEW.provider <> 'aws_ses' THEN RAISE EXCEPTION 'Only Amazon SES accounts can be VIP'; END IF;
  IF NEW.is_vip AND (SELECT count(*) FROM public.provider_accounts WHERE is_vip AND id <> NEW.id) >= 10 THEN
    RAISE EXCEPTION 'The VIP pool is limited to 10 Amazon SES accounts';
  END IF;
  IF NOT NEW.is_vip AND EXISTS (SELECT 1 FROM public.vip_clients WHERE ses_account_id = NEW.id) THEN
    RAISE EXCEPTION 'Unassign this account from its VIP client first';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER provider_accounts_vip_guard BEFORE INSERT OR UPDATE ON public.provider_accounts FOR EACH ROW EXECUTE FUNCTION public.vip_pool_guard();

CREATE OR REPLACE FUNCTION public.vip_client_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ses_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.provider_accounts WHERE id = NEW.ses_account_id AND is_vip AND provider = 'aws_ses') THEN
    RAISE EXCEPTION 'The primary account must be one of the 10 VIP Amazon SES accounts';
  END IF;
  IF NEW.backup_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.provider_accounts WHERE id = NEW.backup_account_id AND provider = 'aws_ses') THEN
    RAISE EXCEPTION 'The backup account must be an Amazon SES account';
  END IF;
  IF NEW.backup_account_id IS NOT NULL AND NEW.backup_account_id = NEW.ses_account_id THEN
    RAISE EXCEPTION 'Backup account must differ from the primary account';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER vip_clients_guard BEFORE INSERT OR UPDATE ON public.vip_clients FOR EACH ROW EXECUTE FUNCTION public.vip_client_guard();

CREATE TABLE public.suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  reason text NOT NULL DEFAULT 'manual' CHECK (reason IN ('hard_bounce','complaint','unsubscribe','manual','legal')),
  source text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppressions_email_lower CHECK (email = lower(trim(email)))
);
CREATE UNIQUE INDEX suppressions_email_key ON public.suppressions(email);
GRANT SELECT, INSERT, DELETE ON public.suppressions TO authenticated;
GRANT ALL ON public.suppressions TO service_role;
ALTER TABLE public.suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "supp list read" ON public.suppressions FOR SELECT TO authenticated USING (public.has_permission('suppression','view'));
CREATE POLICY "supp list add" ON public.suppressions FOR INSERT TO authenticated WITH CHECK (public.has_permission('suppression','create') AND created_by = auth.uid());
CREATE POLICY "supp list remove" ON public.suppressions FOR DELETE TO authenticated USING (public.has_permission('suppression','delete'));

CREATE OR REPLACE FUNCTION public.suppression_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.activity_logs(user_id, user_email, module, action, details)
  VALUES (auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()), 'suppression',
          CASE WHEN TG_OP = 'INSERT' THEN 'suppress' ELSE 'unsuppress' END,
          CASE WHEN TG_OP = 'INSERT' THEN NEW.email || ' · ' || NEW.reason ELSE OLD.email END);
  RETURN NULL;
END $$;
CREATE TRIGGER suppressions_audit AFTER INSERT OR DELETE ON public.suppressions FOR EACH ROW EXECUTE FUNCTION public.suppression_audit();

CREATE OR REPLACE FUNCTION public.enqueue_campaign(cid uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
   AND NOT EXISTS (SELECT 1 FROM public.suppressions g WHERE g.email = lower(trim(s.email)))
 ORDER BY lower(trim(s.email)), s.created_at
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n = ROW_COUNT;
 RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.signup_open() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles)
$$;
GRANT EXECUTE ON FUNCTION public.signup_open() TO anon, authenticated;