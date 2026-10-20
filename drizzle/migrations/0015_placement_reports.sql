CREATE TABLE public.placement_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  subject text,
  sender text,
  seeds_checked int NOT NULL DEFAULT 0,
  found int NOT NULL DEFAULT 0,
  inbox int NOT NULL DEFAULT 0,
  promotions int NOT NULL DEFAULT 0,
  spam int NOT NULL DEFAULT 0,
  other int NOT NULL DEFAULT 0,
  missing int NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.placement_reports TO authenticated;
GRANT ALL ON public.placement_reports TO service_role;
ALTER TABLE public.placement_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view placement reports" ON public.placement_reports FOR SELECT TO authenticated USING (public.has_permission('servers','view'));
CREATE POLICY "delete placement reports" ON public.placement_reports FOR DELETE TO authenticated USING (public.has_permission('servers','delete'));
CREATE INDEX placement_reports_created_idx ON public.placement_reports (created_at DESC);