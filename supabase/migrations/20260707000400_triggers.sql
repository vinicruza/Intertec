-- ============================================================
-- 0004 — Triggers: o que o banco garante sozinho
-- Ref.: docs/03-Banco-de-Dados.md §5 (defesa em profundidade — A5)
-- ============================================================

-- 1) updated_at automático em toda tabela
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'tenants','profiles','channels','sellers','suppliers','customers',
    'inputs','products','product_components','expense_allocation_periods',
    'expense_allocations','kits','kit_items','orders','order_items',
    'real_monthly_expenses','icsm_rates','difal_rates','portal_freight_rates','margin_rules'
  ] loop
    execute format(
      'create trigger trg_%s_updated_at before update on %I
       for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- 2) Alteração de preço de insumo → input_cost_history + audit_logs
create or replace function public.log_input_price_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.price_with_tax is distinct from old.price_with_tax)
     or (new.price_without_tax is distinct from old.price_without_tax) then
    insert into input_cost_history
      (tenant_id, input_id, old_price_with_tax, new_price_with_tax,
       old_price_without_tax, new_price_without_tax, changed_by)
    values
      (new.tenant_id, new.id, old.price_with_tax, new.price_with_tax,
       old.price_without_tax, new.price_without_tax, auth.uid());
    insert into audit_logs (tenant_id, entity, entity_id, action, old_value, new_value, user_id)
    values (new.tenant_id, 'inputs', new.id, 'price_change',
      jsonb_build_object('price_with_tax', old.price_with_tax, 'price_without_tax', old.price_without_tax),
      jsonb_build_object('price_with_tax', new.price_with_tax, 'price_without_tax', new.price_without_tax),
      auth.uid());
    new.price_updated_at = now();
  end if;
  return new;
end $$;

create trigger trg_inputs_price_history
before update on inputs
for each row execute function public.log_input_price_change();

-- 3) Alteração de fator de complexidade → factor_history + audit_logs
create or replace function public.log_factor_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.complexity_factor is distinct from old.complexity_factor then
    insert into factor_history (tenant_id, allocation_id, old_factor, new_factor, changed_by)
    values (new.tenant_id, new.id, old.complexity_factor, new.complexity_factor, auth.uid());
    insert into audit_logs (tenant_id, entity, entity_id, action, old_value, new_value, user_id)
    values (new.tenant_id, 'expense_allocations', new.id, 'factor_change',
      jsonb_build_object('complexity_factor', old.complexity_factor),
      jsonb_build_object('complexity_factor', new.complexity_factor),
      auth.uid());
  end if;
  return new;
end $$;

create trigger trg_allocations_factor_history
before update on expense_allocations
for each row execute function public.log_factor_change();

-- 4) Anti-ciclo na ficha técnica (A contém B que contém A — proibido)
create or replace function public.check_component_cycle()
returns trigger language plpgsql as $$
declare has_cycle boolean;
begin
  if new.component_product_id is null then
    return new;
  end if;
  with recursive reach as (
    select pc.component_product_id as pid
    from product_components pc
    where pc.product_id = new.component_product_id
      and pc.component_product_id is not null
    union
    select pc.component_product_id
    from product_components pc
    join reach r on pc.product_id = r.pid
    where pc.component_product_id is not null
  )
  select exists (select 1 from reach where pid = new.product_id)
      or new.component_product_id = new.product_id
  into has_cycle;
  if has_cycle then
    raise exception 'Referência circular na ficha técnica: o produto % não pode conter (direta ou indiretamente) a si mesmo', new.product_id;
  end if;
  return new;
end $$;

create trigger trg_components_no_cycle
before insert or update on product_components
for each row execute function public.check_component_cycle();

-- 5) Validação de fechamento de pedido (PRD §7 + golden test T9)
create or replace function public.validate_order_close()
returns trigger language plpgsql as $$
begin
  if new.status = 'closed' and old.status <> 'closed' then
    if new.uf is null or new.commission_rate is null or new.freight is null then
      raise exception 'Fechamento bloqueado: pedido sem UF, comissão ou frete definidos';
    end if;
    if not exists (select 1 from order_items oi where oi.order_id = new.id) then
      raise exception 'Fechamento bloqueado: pedido sem itens';
    end if;
    if exists (
      select 1 from order_items oi
      where oi.order_id = new.id
        and (oi.cmv_unit_snapshot is null or oi.cmv_unit_snapshot <= 0)
    ) then
      raise exception 'Fechamento bloqueado: item com CMV zerado ou sem snapshot (nunca zero silencioso — T9)';
    end if;
    new.closed_at = now();
    new.closed_by = coalesce(new.closed_by, auth.uid());
  end if;
  return new;
end $$;

create trigger trg_orders_validate_close
before update on orders
for each row execute function public.validate_order_close();

-- 6) Pedido fechado é imutável (D7); reabertura = voltar para simulation (só Admin via RLS)
create or replace function public.protect_closed_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'closed' then
      raise exception 'Pedido fechado não pode ser excluído (D7)';
    end if;
    return old;
  end if;
  if old.status = 'closed' then
    if new.status = 'simulation' then
      insert into audit_logs (tenant_id, entity, entity_id, action, old_value, new_value, user_id)
      values (old.tenant_id, 'orders', old.id, 'reopen',
        jsonb_build_object('status', old.status, 'closed_at', old.closed_at),
        jsonb_build_object('status', new.status), auth.uid());
      return new;
    end if;
    raise exception 'Pedido fechado é imutável (D7); reabertura gera novo snapshot e trilha de auditoria';
  end if;
  return new;
end $$;

create trigger trg_orders_immutable
before update or delete on orders
for each row execute function public.protect_closed_order();

-- 7) Itens de pedido fechado também são imutáveis
create or replace function public.protect_closed_order_items()
returns trigger language plpgsql as $$
declare v_order_id uuid;
begin
  v_order_id := coalesce(new.order_id, old.order_id);
  if exists (select 1 from orders o where o.id = v_order_id and o.status = 'closed') then
    raise exception 'Itens de pedido fechado são imutáveis (D7)';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger trg_order_items_immutable
before insert or update or delete on order_items
for each row execute function public.protect_closed_order_items();
