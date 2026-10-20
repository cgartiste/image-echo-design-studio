CREATE TABLE public.ab_results (
  campaign_id uuid PRIMARY KEY REFERENCES public.campaigns(id) ON DELETE CASCADE,
  winner text NOT NULL,
  metric text NOT NULL,
  confidence numeric,
  auto boolean NOT NULL DEFAULT false,
  decided_by uuid,
  decided_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ab_results TO authenticated;
GRANT ALL ON public.ab_results TO service_role;
ALTER TABLE public.ab_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ab read" ON public.ab_results FOR SELECT TO authenticated USING (public.has_permission('campaigns','view'));
CREATE POLICY "ab write" ON public.ab_results FOR INSERT TO authenticated WITH CHECK (public.has_permission('campaigns','edit') AND decided_by = auth.uid());
CREATE POLICY "ab update" ON public.ab_results FOR UPDATE TO authenticated USING (public.has_permission('campaigns','edit')) WITH CHECK (public.has_permission('campaigns','edit') AND decided_by = auth.uid());
CREATE POLICY "ab delete" ON public.ab_results FOR DELETE TO authenticated USING (public.has_permission('campaigns','edit'));

CREATE OR REPLACE FUNCTION public.ab_variant_stats(cid uuid) RETURNS TABLE(variant text, sent bigint, opened bigint, clicked bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission('campaigns','view') THEN RAISE EXCEPTION 'Permission denied'; END IF;
  RETURN QUERY SELECT coalesce(j.variant,'A'), count(*) FILTER (WHERE j.sent_at IS NOT NULL), count(*) FILTER (WHERE j.opened_at IS NOT NULL), count(*) FILTER (WHERE j.clicked_at IS NOT NULL)
  FROM public.send_jobs j WHERE j.campaign_id = cid AND NOT j.is_test GROUP BY 1 ORDER BY 1;
END $$;
GRANT EXECUTE ON FUNCTION public.ab_variant_stats(uuid) TO authenticated;

CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'tag' CHECK (kind IN ('tag','category')),
  color text NOT NULL DEFAULT 'slate' CHECK (color IN ('slate','red','amber','green','blue','violet','pink')),
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tags_name_kind ON public.tags(lower(name), kind);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags read" ON public.tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "tags add" ON public.tags FOR INSERT TO authenticated WITH CHECK (public.has_permission('campaigns','edit') AND created_by = auth.uid());
CREATE POLICY "tags edit" ON public.tags FOR UPDATE TO authenticated USING (public.has_permission('campaigns','edit')) WITH CHECK (public.has_permission('campaigns','edit'));
CREATE POLICY "tags remove" ON public.tags FOR DELETE TO authenticated USING (public.has_permission('campaigns','delete'));

CREATE TABLE public.taggings (
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('campaign','list','offer','segment')),
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tag_id, entity_type, entity_id)
);
CREATE INDEX taggings_entity ON public.taggings(entity_type, entity_id);
GRANT SELECT, INSERT, DELETE ON public.taggings TO authenticated;
GRANT ALL ON public.taggings TO service_role;
ALTER TABLE public.taggings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "taggings read" ON public.taggings FOR SELECT TO authenticated USING (true);
CREATE POLICY "taggings add" ON public.taggings FOR INSERT TO authenticated WITH CHECK (public.has_permission('campaigns','edit'));
CREATE POLICY "taggings remove" ON public.taggings FOR DELETE TO authenticated USING (public.has_permission('campaigns','edit'));