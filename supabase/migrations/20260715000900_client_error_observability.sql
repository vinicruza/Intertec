create table if not exists public.client_errors(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  user_id uuid not null references public.profiles(id),
  occurred_at timestamptz not null default now(),
  path text not null check(length(path)<=500),
  message text not null check(length(message)<=2000),
  stack text check(length(stack)<=12000),
  user_agent text check(length(user_agent)<=1000),
  context jsonb not null default '{}'::jsonb
);
create index if not exists client_errors_tenant_occurred_idx on public.client_errors(tenant_id,occurred_at desc);
create index if not exists client_errors_user_id_idx on public.client_errors(user_id);
alter table public.client_errors enable row level security;

create policy client_errors_insert on public.client_errors for insert to authenticated
with check (
  tenant_id=(select public.current_tenant_id())
  and user_id=(select auth.uid())
);
create policy client_errors_select on public.client_errors for select to authenticated
using (
  tenant_id=(select public.current_tenant_id())
  and (select public.current_user_role()) in ('admin','financeiro')
);

revoke all on public.client_errors from public,anon;
grant select,insert on public.client_errors to authenticated;

create or replace function public.log_client_error(
  p_path text,p_message text,p_stack text default null,p_user_agent text default null,p_context jsonb default '{}'::jsonb)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.client_errors(tenant_id,user_id,path,message,stack,user_agent,context)
  values(
    public.current_tenant_id(),auth.uid(),
    left(coalesce(p_path,'/'),500),left(coalesce(nullif(p_message,''),'Erro sem mensagem'),2000),
    left(p_stack,12000),left(p_user_agent,1000),coalesce(p_context,'{}'::jsonb)
  );
end $$;
revoke execute on function public.log_client_error(text,text,text,text,jsonb) from public,anon;
grant execute on function public.log_client_error(text,text,text,text,jsonb) to authenticated;
