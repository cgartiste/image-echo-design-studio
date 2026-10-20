CREATE TABLE public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','mitigated','resolved')),
  area text NOT NULL DEFAULT 'deliverability',
  description text,
  root_cause text,
  resolution text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.incident_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  body text NOT NULL,
  author_email text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incidents TO authenticated;
GRANT SELECT, INSERT ON public.incident_notes TO authenticated;
GRANT ALL ON public.incidents TO service_role;
GRANT ALL ON public.incident_notes TO service_role;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view incidents" ON public.incidents FOR SELECT TO authenticated USING (public.has_permission('servers','view'));
CREATE POLICY "create incidents" ON public.incidents FOR INSERT TO authenticated WITH CHECK (public.has_permission('servers','view'));
CREATE POLICY "edit incidents" ON public.incidents FOR UPDATE TO authenticated USING (public.has_permission('servers','edit'));
CREATE POLICY "delete incidents" ON public.incidents FOR DELETE TO authenticated USING (public.has_permission('servers','delete'));
CREATE POLICY "view notes" ON public.incident_notes FOR SELECT TO authenticated USING (public.has_permission('servers','view'));
CREATE POLICY "add notes" ON public.incident_notes FOR INSERT TO authenticated WITH CHECK (public.has_permission('servers','view') AND created_by = auth.uid());