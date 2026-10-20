CREATE TABLE public.campaign_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  audience text NOT NULL CHECK (audience IN ('non_openers','openers','clickers','non_clickers')),
  delay_hours int NOT NULL DEFAULT 48 CHECK (delay_hours BETWEEN 1 AND 720),
  template_id uuid REFERENCES public.email_templates(id) ON DELETE SET NULL,
  subject text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_followups TO authenticated;
GRANT ALL ON public.campaign_followups TO service_role;
ALTER TABLE public.campaign_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view followups" ON public.campaign_followups FOR SELECT TO authenticated USING (public.has_permission('campaigns','view'));
CREATE POLICY "create followups" ON public.campaign_followups FOR INSERT TO authenticated WITH CHECK (public.has_permission('campaigns','create'));
CREATE POLICY "edit followups" ON public.campaign_followups FOR UPDATE TO authenticated USING (public.has_permission('campaigns','edit'));
CREATE POLICY "delete followups" ON public.campaign_followups FOR DELETE TO authenticated USING (public.has_permission('campaigns','delete'));