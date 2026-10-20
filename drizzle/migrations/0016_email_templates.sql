CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  subject text NOT NULL DEFAULT '',
  preheader text,
  html_content text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view templates" ON public.email_templates FOR SELECT TO authenticated USING (public.has_permission('campaigns','view'));
CREATE POLICY "create templates" ON public.email_templates FOR INSERT TO authenticated WITH CHECK (public.has_permission('campaigns','create'));
CREATE POLICY "edit templates" ON public.email_templates FOR UPDATE TO authenticated USING (public.has_permission('campaigns','edit'));
CREATE POLICY "delete templates" ON public.email_templates FOR DELETE TO authenticated USING (public.has_permission('campaigns','delete'));