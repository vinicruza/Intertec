-- Admin pode aprovar pedido próprio e pedido normal pode ter item de amostra.

-- A regra anterior bloqueava qualquer usuário que tivesse enviado a cotação.
-- Mantemos a segregação para os demais perfis, mas o Administrador vira
-- exceção operacional: ele pode lançar e liberar quando não houver outro
-- aprovador disponível.
create or replace function public.decide_order_approval(
  p_order_id uuid,
  p_aprovado boolean,
  p_notes text default null
)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_role text := public.current_user_role();
  v_cfg public.approval_settings%rowtype;
  v_order public.orders%rowtype;
  v_margem numeric;
begin
  select * into v_cfg from public.approval_settings where tenant_id = v_tenant_id;
  if not found then raise exception 'Parâmetros de aprovação não configurados'; end if;
  if v_role is null or not (v_role = any(v_cfg.approver_roles)) then
    raise exception 'Seu perfil não tem permissão para aprovar pedidos';
  end if;

  select * into v_order from public.orders
   where id = p_order_id and tenant_id = v_tenant_id;
  if not found then raise exception 'Cotação não encontrada'; end if;
  if v_order.approval_status <> 'pendente' then
    raise exception 'Esta cotação não está aguardando aprovação';
  end if;

  if v_role <> 'admin'
     and v_order.submitted_by is not null
     and v_order.submitted_by = auth.uid() then
    raise exception 'Quem enviou esta cotação para aprovação não pode aprová-la. Peça que outra pessoa com perfil aprovador decida.';
  end if;

  if p_aprovado and v_cfg.block_below_margin is not null
     and v_order.net_revenue_snapshot is not null
     and v_order.net_revenue_snapshot <> 0 then
    v_margem := v_order.contribution_margin_snapshot / v_order.net_revenue_snapshot;
    if v_margem < v_cfg.block_below_margin then
      raise exception 'Margem de % está abaixo do mínimo permitido para aprovação (%)',
        round(v_margem * 100, 2), round(v_cfg.block_below_margin * 100, 2);
    end if;
  end if;

  update public.orders
     set approval_status = case when p_aprovado then 'aprovado' else 'recusado' end::approval_status,
         approved_at = now(),
         approved_by = auth.uid(),
         approval_notes = nullif(btrim(p_notes), '')
   where id = p_order_id and tenant_id = v_tenant_id;

  insert into public.audit_logs (tenant_id, entity, entity_id, action, old_value, new_value, user_id)
  values (v_tenant_id, 'orders', p_order_id,
          case when p_aprovado then 'approve' else 'reject' end,
          jsonb_build_object('approval_status', 'pendente'),
          jsonb_build_object('approval_status', case when p_aprovado then 'aprovado' else 'recusado' end,
                             'notes', p_notes),
          auth.uid());
end $$;

alter table public.order_items
  add column if not exists item_kind text not null default 'sale';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'order_items_item_kind_check'
       and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_item_kind_check check (item_kind in ('sale', 'sample'));
  end if;
end $$;

comment on column public.order_items.item_kind is
  'sale = item vendido normalmente; sample = amostra sem cobrança dentro de pedido normal.';

create or replace function public.set_order_item_kind_from_price()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.unit_price, 0) = 0 then
    new.item_kind := 'sample';
  elsif new.item_kind is null then
    new.item_kind := 'sale';
  end if;
  return new;
end $$;

drop trigger if exists trg_order_items_item_kind_from_price on public.order_items;
create trigger trg_order_items_item_kind_from_price
before insert or update of unit_price, item_kind on public.order_items
for each row execute function public.set_order_item_kind_from_price();
