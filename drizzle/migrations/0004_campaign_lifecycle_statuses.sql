ALTER TYPE public.campaign_status ADD VALUE IF NOT EXISTS 'ready';
ALTER TYPE public.campaign_status ADD VALUE IF NOT EXISTS 'publishing';
ALTER TYPE public.campaign_status ADD VALUE IF NOT EXISTS 'stopping';
ALTER TYPE public.campaign_status ADD VALUE IF NOT EXISTS 'stopped';
ALTER TYPE public.campaign_status ADD VALUE IF NOT EXISTS 'test';
ALTER TYPE public.campaign_status ADD VALUE IF NOT EXISTS 'waiting_approval';