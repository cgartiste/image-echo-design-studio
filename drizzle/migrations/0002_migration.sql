
create or replace function public.enforce_verified_sender()
returns trigger language plpgsql security definer set search_path = public as $$
declare dom text;
begin
  if new.status in ('scheduled','running') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    dom := lower(split_part(coalesce(new.from_email,''), '@', 2));
    if dom = '' or not exists (select 1 from public.domains where name = dom and status = 'verified') then
      raise exception 'Sender domain "%" is not verified (SPF, DKIM and DMARC must pass in Domains & DNS)', dom;
    end if;
    if new.html_content not like '%{{unsubscribe_url}}%' then
      raise exception 'Campaign must contain an {{unsubscribe_url}} link';
    end if;
  end if;
  return new;
end $$;
create trigger campaigns_verified_sender before insert or update on public.campaigns
for each row execute function public.enforce_verified_sender();
