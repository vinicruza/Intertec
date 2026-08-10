create table if not exists public.monitoring_events(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  user_id uuid not null references public.profiles(id),
  occurred_at timestamptz not null default now(),
  event_type text not null check(length(event_type) between 1 and 80),
  path text not null check(length(path)<=500),
  duration_ms integer check(duration_ms is null or duration_ms between 0 and 600000),
  context jsonb not null default '{}'::jsonb
);

create index if not exists monitoring_events_tenant_occurred_idx
  on public.monitoring_events(tenant_id, occurred_at desc);
create index if not exists monitoring_events_type_occurred_idx
  on public.monitoring_events(tenant_id, event_type, occurred_at desc);
create index if not exists monitoring_events_user_occurred_idx
  on public.monitoring_events(user_id, occurred_at desc);

alter table public.monitoring_events enable row level security;

create policy monitoring_events_insert on public.monitoring_events for insert to authenticated
with check (
  tenant_id=(select public.current_tenant_id())
  and user_id=(select auth.uid())
);

create policy monitoring_events_select on public.monitoring_events for select to authenticated
using (
  tenant_id=(select public.current_tenant_id())
  and (select public.current_user_role()) in ('admin','financeiro')
);

revoke all on public.monitoring_events from public,anon;
grant select,insert on public.monitoring_events to authenticated;

create or replace function public.log_monitoring_event(
  p_event_type text,
  p_path text default null,
  p_duration_ms integer default null,
  p_context jsonb default '{}'::jsonb
)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.monitoring_events(tenant_id,user_id,event_type,path,duration_ms,context)
  values(
    public.current_tenant_id(),
    auth.uid(),
    left(coalesce(nullif(p_event_type,''),'evento'),80),
    left(coalesce(nullif(p_path,''),'/'),500),
    case
      when p_duration_ms is null then null
      when p_duration_ms < 0 then null
      when p_duration_ms > 600000 then 600000
      else p_duration_ms
    end,
    coalesce(p_context,'{}'::jsonb)
  );
end $$;

revoke execute on function public.log_monitoring_event(text,text,integer,jsonb) from public,anon;
grant execute on function public.log_monitoring_event(text,text,integer,jsonb) to authenticated;
