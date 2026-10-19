CREATE OR REPLACE FUNCTION public.update_campaign_recipient_count() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE included uuid[]; excluded uuid[]; result jsonb;
BEGIN
 SELECT coalesce(array_agg(value::uuid),'{}'::uuid[]) INTO included FROM jsonb_array_elements_text(coalesce(NEW.settings->'included_lists','[]'::jsonb));
 IF cardinality(included)=0 AND NEW.list_id IS NOT NULL THEN included:=ARRAY[NEW.list_id]; END IF;
 SELECT coalesce(array_agg(value::uuid),'{}'::uuid[]) INTO excluded FROM jsonb_array_elements_text(coalesce(NEW.settings->'excluded_lists','[]'::jsonb));
 result:=public.campaign_recipient_summary(included,excluded,coalesce(NEW.settings->>'country',''),coalesce((NEW.settings->>'engagement_min')::integer,0));
 NEW.recipient_count:=coalesce((result->>'final')::integer,0);
 RETURN NEW;
END $$;
CREATE TRIGGER campaign_recipient_count BEFORE INSERT OR UPDATE OF settings,list_id ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_campaign_recipient_count();