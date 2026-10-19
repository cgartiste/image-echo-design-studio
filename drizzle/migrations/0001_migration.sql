
insert into public.role_permissions (role, module, action)
select r.role::public.app_role, 'domains', a.action
from (values ('admin'),('manager'),('operator'),('analyst'),('viewer')) r(role)
cross join (values ('view'),('create'),('edit'),('delete'),('export'),('execute'),('settings')) a(action)
where r.role in ('admin','manager')
  or (r.role = 'operator' and a.action in ('view','create','edit','execute','export'))
  or (r.role in ('analyst','viewer') and a.action = 'view')
on conflict do nothing;

create table public.provider_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text not null check (provider in ('cloudflare','godaddy','sav','hetzner','ovh','digitalocean','vultr','linode')),
  credentials_encrypted text not null,
  status text not null default 'untested',
  last_error text,
  last_sync_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
grant all on public.provider_accounts to service_role;
alter table public.provider_accounts enable row level security;

create table public.domains (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  account_id uuid references public.provider_accounts(id) on delete set null,
  provider text,
  zone_ref text,
  nameservers text[] not null default '{}',
  dkim_selector text not null default 'default',
  checks jsonb not null default '{}',
  score int not null default 0,
  status text not null default 'pending',
  last_checked_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.domains to authenticated;
grant all on public.domains to service_role;
alter table public.domains enable row level security;
create policy "dom view" on public.domains for select to authenticated using (public.has_permission('domains','view'));
create policy "dom create" on public.domains for insert to authenticated with check (public.has_permission('domains','create'));
create policy "dom edit" on public.domains for update to authenticated using (public.has_permission('domains','edit') or public.has_permission('domains','execute'));
create policy "dom delete" on public.domains for delete to authenticated using (public.has_permission('domains','delete'));

create table public.sending_ips (
  id uuid primary key default gen_random_uuid(),
  ip text not null unique,
  hostname text,
  account_id uuid references public.provider_accounts(id) on delete set null,
  provider text,
  server_ref text,
  ptr_current text,
  rdns_ok boolean,
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.sending_ips to authenticated;
grant all on public.sending_ips to service_role;
alter table public.sending_ips enable row level security;
create policy "ip view" on public.sending_ips for select to authenticated using (public.has_permission('domains','view'));
create policy "ip create" on public.sending_ips for insert to authenticated with check (public.has_permission('domains','create'));
create policy "ip edit" on public.sending_ips for update to authenticated using (public.has_permission('domains','edit'));
create policy "ip delete" on public.sending_ips for delete to authenticated using (public.has_permission('domains','delete'));
