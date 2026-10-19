insert into public.role_permissions (role, module, action)
select r.role::public.app_role, 'offers', a.action
from (values ('admin'),('manager'),('operator'),('analyst'),('viewer')) r(role)
cross join (values ('view'),('create'),('edit'),('delete'),('export'),('execute'),('settings')) a(action)
where r.role in ('admin','manager')
  or (r.role = 'operator' and a.action in ('view','create','edit','execute','export'))
  or (r.role = 'analyst' and a.action in ('view','export'))
  or (r.role = 'viewer' and a.action = 'view')
on conflict do nothing;

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  platform text not null,
  api_driver text not null default 'none',
  login_driver text not null default 'none',
  affiliate_id text,
  api_url text,
  report_url text,
  login_url text,
  home_url text,
  tracking_template text,
  credentials_encrypted text,
  has_password boolean not null default false,
  has_api_key boolean not null default false,
  status text not null default 'untested',
  last_error text,
  last_test_at timestamptz,
  last_offer_sync_at timestamptz,
  last_conversion_sync_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
grant all on public.sponsors to service_role;
alter table public.sponsors enable row level security;

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  external_id text not null,
  name text not null,
  status text not null default 'active',
  payout numeric not null default 0,
  payout_type text,
  currency text default 'USD',
  vertical text,
  countries text[] not null default '{}',
  preview_url text,
  tracking_url text,
  image_url text,
  description text,
  imported boolean not null default false,
  assigned_to uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sponsor_id, external_id)
);
grant select on public.offers to authenticated;
grant all on public.offers to service_role;
alter table public.offers enable row level security;
create policy "offers read" on public.offers for select to authenticated using (public.has_permission('offers','view'));

create table public.conversions (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  external_id text not null,
  offer_external_id text,
  offer_name text,
  payout numeric not null default 0,
  sub1 text, sub2 text, sub3 text,
  user_ref text, offer_ref text, campaign_ref text, list_ref text, subscriber_ref text, interface_ref text,
  converted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (sponsor_id, external_id)
);
grant select on public.conversions to authenticated;
grant all on public.conversions to service_role;
alter table public.conversions enable row level security;
create policy "conv read" on public.conversions for select to authenticated using (public.has_permission('offers','view'));

create table public.suppression_files (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete cascade,
  source_url text not null,
  source_type text not null default 'direct',
  download_url text,
  status text not null default 'ready',
  created_at timestamptz not null default now()
);
grant select on public.suppression_files to authenticated;
grant all on public.suppression_files to service_role;
alter table public.suppression_files enable row level security;
create policy "supp read" on public.suppression_files for select to authenticated using (public.has_permission('offers','view'));

create table public.sponsor_login_sessions (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  user_id uuid not null,
  user_email text,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  result text not null default 'pending',
  ip text,
  created_at timestamptz not null default now()
);
grant select on public.sponsor_login_sessions to authenticated;
grant all on public.sponsor_login_sessions to service_role;
alter table public.sponsor_login_sessions enable row level security;
create policy "sess read" on public.sponsor_login_sessions for select to authenticated using (public.has_permission('offers','view'));

create table public.sponsor_events (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  kind text not null,
  level text not null default 'info',
  message text not null,
  created_at timestamptz not null default now()
);
grant select on public.sponsor_events to authenticated;
grant all on public.sponsor_events to service_role;
alter table public.sponsor_events enable row level security;
create policy "events read" on public.sponsor_events for select to authenticated using (public.has_permission('offers','view'));