alter table public.client_errors
  add column if not exists fingerprint text,
  add column if not exists severity text not null default 'medio'
    check (severity in ('critico','alto','medio','baixo')),
  add column if not exists deploy_ref text;

create index if not exists client_errors_fingerprint_occurred_idx
  on public.client_errors(tenant_id, fingerprint, occurred_at desc);

create table if not exists public.client_error_groups(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  fingerprint text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrences integer not null default 1 check (occurrences > 0),
  severity text not null default 'medio' check (severity in ('critico','alto','medio','baixo')),
  status text not null default 'novo' check (status in ('novo','em_analise','corrigido','ignorado')),
  message text not null check (length(message)<=2000),
  last_path text not null check (length(last_path)<=500),
  stack_preview text,
  last_error_id uuid references public.client_errors(id),
  last_user_id uuid references public.profiles(id),
  deploy_ref text,
  alert_needed boolean not null default false,
  alert_sent_at timestamptz,
  context jsonb not null default '{}'::jsonb,
  unique(tenant_id, fingerprint)
);

create index if not exists client_error_groups_tenant_last_seen_idx
  on public.client_error_groups(tenant_id, last_seen_at desc);
create index if not exists client_error_groups_tenant_status_severity_idx
  on public.client_error_groups(tenant_id, status, severity, last_seen_at desc);
create index if not exists client_error_groups_alert_needed_idx
  on public.client_error_groups(tenant_id, alert_needed, last_seen_at desc)
  where alert_needed;

alter table public.client_error_groups enable row level security;

create policy client_error_groups_select on public.client_error_groups for select to authenticated
using (
  tenant_id=(select public.current_tenant_id())
  and (select public.current_user_role()) in ('admin','financeiro')
);

create policy client_error_groups_update on public.client_error_groups for update to authenticated
using (
  tenant_id=(select public.current_tenant_id())
  and (select public.current_user_role()) in ('admin','financeiro')
)
with check (
  tenant_id=(select public.current_tenant_id())
  and (select public.current_user_role()) in ('admin','financeiro')
);

revoke all on public.client_error_groups from public,anon;
grant select,update on public.client_error_groups to authenticated;

create table if not exists public.client_error_alerts(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  error_group_id uuid not null references public.client_error_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  alert_type text not null default 'novo_erro' check (length(alert_type)<=80),
  severity text not null check (severity in ('critico','alto','medio','baixo')),
  message text not null check (length(message)<=3000),
  sent_at timestamptz,
  send_error text,
  unique(error_group_id, alert_type)
);

create index if not exists client_error_alerts_tenant_created_idx
  on public.client_error_alerts(tenant_id, created_at desc);
create index if not exists client_error_alerts_pending_idx
  on public.client_error_alerts(tenant_id, created_at)
  where sent_at is null;

alter table public.client_error_alerts enable row level security;

create policy client_error_alerts_select on public.client_error_alerts for select to authenticated
using (
  tenant_id=(select public.current_tenant_id())
  and (select public.current_user_role()) in ('admin','financeiro')
);

revoke all on public.client_error_alerts from public,anon;
grant select on public.client_error_alerts to authenticated;

create or replace function public.normalize_observability_path(p_path text)
returns text
language sql
immutable
set search_path=public,pg_temp
as $$
  select left(
    regexp_replace(coalesce(nullif(p_path,''),'/'), '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=/|$)', '/:id', 'gi'),
    500
  );
$$;

create or replace function public.classify_client_error(p_path text, p_message text, p_context jsonb default '{}'::jsonb)
returns text
language plpgsql
immutable
set search_path=public,pg_temp
as $$
declare
  v_path text := coalesce(p_path,'/');
  v_message text := lower(coalesce(p_message,''));
  v_origin text := lower(coalesce(p_context->>'origem',''));
begin
  if v_path ~ '^/(login|simulador|clientes|pedidos|aprovacoes|dre)(/|$)'
     or v_message like '%cannot read properties of undefined%'
     or v_message like '%failed to fetch dynamically imported module%'
     or v_message like '%loading chunk%'
     or v_message like '%dynamically imported module%'
  then
    return 'critico';
  end if;

  if v_origin = 'unhandledrejection'
     or v_message like '%network%'
     or v_message like '%fetch%'
     or v_message like '%timeout%'
  then
    return 'alto';
  end if;

  return 'medio';
end $$;

create or replace function public.log_client_error(
  p_path text,p_message text,p_stack text default null,p_user_agent text default null,p_context jsonb default '{}'::jsonb)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_tenant_id uuid;
  v_user_id uuid;
  v_path text;
  v_message text;
  v_stack text;
  v_context jsonb;
  v_deploy_ref text;
  v_fingerprint text;
  v_severity text;
  v_error_id uuid;
  v_group_id uuid;
begin
  if auth.uid() is null then return; end if;

  v_tenant_id := public.current_tenant_id();
  v_user_id := auth.uid();
  v_path := public.normalize_observability_path(p_path);
  v_message := left(coalesce(nullif(p_message,''),'Erro sem mensagem'),2000);
  v_stack := left(p_stack,12000);
  v_context := coalesce(p_context,'{}'::jsonb);
  v_deploy_ref := left(nullif(coalesce(v_context->>'deployRef', v_context->>'appVersion', ''), ''), 120);
  v_severity := public.classify_client_error(v_path, v_message, v_context);
  v_fingerprint := md5(
    lower(v_path) || '|' ||
    lower(v_message) || '|' ||
    left(lower(coalesce(v_stack,'')), 500) || '|' ||
    coalesce(v_deploy_ref,'')
  );

  insert into public.client_errors(tenant_id,user_id,path,message,stack,user_agent,context,fingerprint,severity,deploy_ref)
  values(
    v_tenant_id,
    v_user_id,
    v_path,
    v_message,
    v_stack,
    left(p_user_agent,1000),
    v_context,
    v_fingerprint,
    v_severity,
    v_deploy_ref
  )
  returning id into v_error_id;

  insert into public.client_error_groups(
    tenant_id,fingerprint,first_seen_at,last_seen_at,occurrences,severity,status,
    message,last_path,stack_preview,last_error_id,last_user_id,deploy_ref,alert_needed,context
  )
  values(
    v_tenant_id,v_fingerprint,now(),now(),1,v_severity,'novo',
    v_message,v_path,left(v_stack,1200),v_error_id,v_user_id,v_deploy_ref,
    v_severity in ('critico','alto'),v_context
  )
  on conflict (tenant_id, fingerprint) do update
  set
    last_seen_at = excluded.last_seen_at,
    occurrences = public.client_error_groups.occurrences + 1,
    severity = case
      when public.client_error_groups.severity = 'critico' or excluded.severity = 'critico' then 'critico'
      when public.client_error_groups.severity = 'alto' or excluded.severity = 'alto' then 'alto'
      when public.client_error_groups.severity = 'medio' or excluded.severity = 'medio' then 'medio'
      else 'baixo'
    end,
    status = case
      when public.client_error_groups.status = 'corrigido' then 'novo'
      else public.client_error_groups.status
    end,
    message = excluded.message,
    last_path = excluded.last_path,
    stack_preview = excluded.stack_preview,
    last_error_id = excluded.last_error_id,
    last_user_id = excluded.last_user_id,
    deploy_ref = excluded.deploy_ref,
    alert_needed = public.client_error_groups.alert_sent_at is null and (public.client_error_groups.severity in ('critico','alto') or excluded.severity in ('critico','alto')),
    context = excluded.context
  returning id into v_group_id;

  if v_severity in ('critico','alto') then
    insert into public.client_error_alerts(tenant_id,error_group_id,alert_type,severity,message)
    values(
      v_tenant_id,
      v_group_id,
      'novo_erro',
      v_severity,
      '[INTERTECH ERRO] ' || upper(v_severity) || ' em ' || v_path || ' - ' || left(v_message, 220)
    )
    on conflict (error_group_id, alert_type) do nothing;
  end if;
end $$;

revoke execute on function public.normalize_observability_path(text) from public,anon;
grant execute on function public.normalize_observability_path(text) to authenticated;
revoke execute on function public.classify_client_error(text,text,jsonb) from public,anon;
grant execute on function public.classify_client_error(text,text,jsonb) to authenticated;
revoke execute on function public.log_client_error(text,text,text,text,jsonb) from public,anon;
grant execute on function public.log_client_error(text,text,text,text,jsonb) to authenticated;
