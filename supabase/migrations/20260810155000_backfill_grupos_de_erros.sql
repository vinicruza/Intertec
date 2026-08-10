with normalizados as (
  select
    ce.id,
    public.normalize_observability_path(ce.path) as path_normalizado,
    public.classify_client_error(ce.path, ce.message, ce.context) as severity,
    left(nullif(coalesce(ce.context->>'deployRef', ce.context->>'appVersion', ''), ''), 120) as deploy_ref,
    md5(
      lower(public.normalize_observability_path(ce.path)) || '|' ||
      lower(ce.message) || '|' ||
      left(lower(coalesce(ce.stack,'')), 500) || '|' ||
      coalesce(left(nullif(coalesce(ce.context->>'deployRef', ce.context->>'appVersion', ''), ''), 120),'')
    ) as fingerprint
  from public.client_errors ce
  where ce.fingerprint is null
)
update public.client_errors ce
set
  path = n.path_normalizado,
  fingerprint = n.fingerprint,
  severity = n.severity,
  deploy_ref = n.deploy_ref
from normalizados n
where ce.id = n.id;

with grupos as (
  select distinct on (tenant_id, fingerprint)
    tenant_id,
    fingerprint,
    min(occurred_at) over (partition by tenant_id, fingerprint) as first_seen_at,
    max(occurred_at) over (partition by tenant_id, fingerprint) as last_seen_at,
    count(*) over (partition by tenant_id, fingerprint)::integer as occurrences,
    case
      when bool_or(severity = 'critico') over (partition by tenant_id, fingerprint) then 'critico'
      when bool_or(severity = 'alto') over (partition by tenant_id, fingerprint) then 'alto'
      when bool_or(severity = 'medio') over (partition by tenant_id, fingerprint) then 'medio'
      else 'baixo'
    end as severity,
    message,
    path as last_path,
    left(stack, 1200) as stack_preview,
    id as last_error_id,
    user_id as last_user_id,
    deploy_ref,
    context
  from public.client_errors
  where fingerprint is not null
  order by tenant_id, fingerprint, occurred_at desc
), inseridos as (
  insert into public.client_error_groups(
    tenant_id, fingerprint, first_seen_at, last_seen_at, occurrences, severity, status,
    message, last_path, stack_preview, last_error_id, last_user_id, deploy_ref, alert_needed, context
  )
  select
    tenant_id, fingerprint, first_seen_at, last_seen_at, occurrences, severity, 'novo',
    message, last_path, stack_preview, last_error_id, last_user_id, deploy_ref,
    severity in ('critico','alto'), context
  from grupos
  on conflict (tenant_id, fingerprint) do update
  set
    first_seen_at = least(public.client_error_groups.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(public.client_error_groups.last_seen_at, excluded.last_seen_at),
    occurrences = excluded.occurrences,
    severity = excluded.severity,
    message = excluded.message,
    last_path = excluded.last_path,
    stack_preview = excluded.stack_preview,
    last_error_id = excluded.last_error_id,
    last_user_id = excluded.last_user_id,
    deploy_ref = excluded.deploy_ref,
    alert_needed = excluded.severity in ('critico','alto') and public.client_error_groups.alert_sent_at is null,
    context = excluded.context
  returning id, tenant_id, severity, message, last_path
)
insert into public.client_error_alerts(tenant_id, error_group_id, alert_type, severity, message)
select tenant_id, id, 'novo_erro', severity, '[INTERTECH ERRO] ' || upper(severity) || ' em ' || last_path || ' - ' || left(message, 220)
from inseridos
where severity in ('critico','alto')
on conflict (error_group_id, alert_type) do nothing;

with historicos as (
  select id
  from public.client_error_groups
  where last_seen_at < now() - interval '10 minutes'
)
update public.client_error_alerts a
set sent_at = now(), send_error = 'Registro historico agrupado, sem envio retroativo'
from historicos h
where a.error_group_id = h.id
  and a.sent_at is null;

update public.client_error_groups
set alert_needed = false, alert_sent_at = now()
where last_seen_at < now() - interval '10 minutes'
  and alert_needed = true;
