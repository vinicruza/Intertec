-- REGISTRO DE MIGRAÇÃO APLICADA DIRETO NO BANCO (04/09/2026, 17h02).
-- Transcrita de `supabase_migrations.schema_migrations`, sem alteração.
--
-- Duas coisas sem relação entre si, no mesmo arquivo:
--
-- 1. Kit não pode ser componente de outro kit (gatilho em `kit_items`).
--
-- 2. O NÚMERO DIÁRIO DO PEDIDO passa a nascer no FECHAMENTO, e não mais no
--    INSERT da cotação. É a resposta à pergunta da Cris de 31/08/2026 ("por
--    que a folha diz PEDIDO se o orçamento está em aberto?") e à pendência
--    registrada em Calculations.md §16.3: o número carregava a data em que a
--    COTAÇÃO nasceu, não a do dia em que o pedido foi gerado.
--
--    Efeito colateral bom: cotação em aberto passa a ter `order_number` nulo,
--    o que torna a folha e a tela do pedido honestas sem depender de regra de
--    exibição. Os pedidos criados ANTES desta migração seguem com o número do
--    dia da cotação — não foram renumerados, e não devem ser (D7).

create or replace function public.is_product_classified_as_kit(
  p_product_id uuid,
  p_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.products p
      left join public.product_categories pc
        on pc.id = p.category_id
       and pc.tenant_id = p.tenant_id
     where p.id = p_product_id
       and p.tenant_id = p_tenant_id
       and (
         p.code ilike 'KC%'
         or p.category ilike '%kit%'
         or pc.name ilike '%kit%'
       )
  );
$$;

create or replace function public.reject_kit_product_as_kit_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_product_classified_as_kit(new.product_id, new.tenant_id) then
    raise exception 'Nao e permitido adicionar um kit como componente de outro kit';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_kit_items_no_kit_product on public.kit_items;
create trigger trg_kit_items_no_kit_product
before insert or update of product_id on public.kit_items
for each row execute function public.reject_kit_product_as_kit_item();

create or replace function public.set_order_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    new.order_number := public.next_order_number(
      new.tenant_id,
      (coalesce(new.closed_at, now()) at time zone 'America/Sao_Paulo')::date
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_order_number on public.orders;
create trigger trg_orders_order_number
before update of status on public.orders
for each row execute function public.set_order_number();
