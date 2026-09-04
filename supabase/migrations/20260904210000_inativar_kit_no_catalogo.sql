-- Inativar e reativar um kit pelo catálogo (pedido da Patricia, 04/09/2026).
--
-- "Vini, eu consigo inativar um kit?" Pela tela, não. A coluna `kits.status`
-- existe desde o primeiro dia e o sistema inteiro já a respeita — kit inativo
-- não entra na lista de itens vendáveis do simulador nem no "partir de um kit
-- existente" —, mas nunca houve onde clicar.
--
-- O efeito prático disso já apareceu na base: quatro kits (KC0025, KC0028,
-- KC0030 e KC0031) foram inativados em 04/09/2026 por um UPDATE manual, os
-- quatro com a mesma marca de tempo. Funcionou e não quebrou nada, mas ficou
-- sem registro de quem fez e por quê. É esse buraco que esta migração fecha.
--
-- INATIVAR NÃO É APAGAR: o kit continua no sistema, com o mesmo código, e
-- voltar a vender aquele conjunto é reativar. Excluir kit continua não
-- existindo, e é proposital: kit usado em pedido fechado não pode sumir do
-- histórico.
--
-- O que a inativação NÃO faz mais é reservar a composição. Até 04/09/2026 o
-- índice único da assinatura valia para qualquer status; nesse dia ele virou
-- parcial (`kits_active_signature_unique ... where status = 'active'`), então
-- montar os mesmos itens com o kit fora cria um kit NOVO. A migração
-- 20260904213000 cuida do que isso permite: reativar um kit cuja composição
-- foi ocupada no meio-tempo.

-- ------------------------------------------------------------------
-- 1. A auditoria passa a contar os ORÇAMENTOS EM ABERTO de cada kit
-- ------------------------------------------------------------------
-- Inativar um kit que está dentro de uma cotação ainda aberta tem consequência
-- visível: como o kit sai da lista de itens vendáveis, aquela linha da cotação
-- abre em branco no simulador. Hoje o caso vivo é o KC0024 (KIT WEVETS), em 4
-- cotações abertas. Quem inativa precisa ser avisado ANTES, e para isso a tela
-- precisa do número.
--
-- Cotação CANCELADA não conta, e é por isso que a conta olha `cancelled_at`:
-- dos quatro kits inativados à mão, o KC0028 estava numa cotação 'simulation'
-- — mas cancelada (ORC-2026-0195). Contá-la geraria um susto sobre um papel
-- que ninguém vai reabrir.
--
-- O tipo de retorno muda, então a função cai antes de ser recriada.
drop function if exists public.get_kits_audit();

create or replace function public.get_kits_audit()
returns table (
  kit_id uuid,
  created_at timestamptz,
  created_by_name text,
  source_order_id uuid,
  source_order_quote_number text,
  source_order_number text,
  source_order_customer_name text,
  source_order_status text,
  used_in_orders_count bigint,
  generated_orders_count bigint,
  open_orders_count bigint,
  total_quantity numeric,
  last_used_at timestamptz,
  recent_orders jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with usos as (
    select
      oi.kit_id,
      oi.order_id,
      sum(oi.quantity) as quantidade,
      max(oi.created_at) as item_created_at
    from public.order_items oi
    where oi.tenant_id = public.current_tenant_id()
      and oi.kit_id is not null
    group by oi.kit_id, oi.order_id
  ),
  usos_com_pedido as (
    select
      u.*,
      o.quote_number,
      o.order_number,
      o.status::text as order_status,
      o.cancelled_at,
      c.name as customer_name,
      coalesce(o.closed_at, o.updated_at, o.created_at, u.item_created_at) as used_at,
      row_number() over (
        partition by u.kit_id
        order by coalesce(o.closed_at, o.updated_at, o.created_at, u.item_created_at) desc, u.order_id
      ) as ordem
    from usos u
    join public.orders o on o.id = u.order_id
      and o.tenant_id = public.current_tenant_id()
    left join public.customers c on c.id = o.customer_id
      and c.tenant_id = o.tenant_id
  )
  select
    k.id as kit_id,
    k.created_at,
    p.full_name as created_by_name,
    k.source_order_id,
    so.quote_number as source_order_quote_number,
    so.order_number as source_order_number,
    sc.name as source_order_customer_name,
    so.status::text as source_order_status,
    count(distinct u.order_id) as used_in_orders_count,
    count(distinct u.order_id) filter (where u.order_status = 'closed') as generated_orders_count,
    -- Orçamento EM ABERTO: ainda é 'simulation' e não foi cancelado. Cotação
    -- perdida e pedido gerado não entram — nenhum dos dois volta ao simulador
    -- para ser editado.
    count(distinct u.order_id) filter (
      where u.order_status = 'simulation' and u.cancelled_at is null
    ) as open_orders_count,
    coalesce(sum(u.quantidade), 0) as total_quantity,
    max(u.used_at) as last_used_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'order_id', u.order_id,
          'quote_number', u.quote_number,
          'order_number', u.order_number,
          'status', u.order_status,
          'customer_name', u.customer_name,
          'quantity', u.quantidade,
          'used_at', u.used_at
        )
        order by u.used_at desc, u.order_id
      ) filter (where u.ordem <= 5),
      '[]'::jsonb
    ) as recent_orders
  from public.kits k
  left join public.profiles p on p.id = k.created_by
  left join public.orders so on so.id = k.source_order_id
    and so.tenant_id = k.tenant_id
  left join public.customers sc on sc.id = so.customer_id
    and sc.tenant_id = so.tenant_id
  left join usos_com_pedido u on u.kit_id = k.id
  where k.tenant_id = public.current_tenant_id()
    and public.current_user_role() is not null
  group by
    k.id,
    k.created_at,
    p.full_name,
    k.source_order_id,
    so.quote_number,
    so.order_number,
    sc.name,
    so.status;
$$;

revoke execute on function public.get_kits_audit() from public, anon;
grant execute on function public.get_kits_audit() to authenticated;

-- ------------------------------------------------------------------
-- 2. Ativar / inativar, com registro de quem fez
-- ------------------------------------------------------------------
-- SOMENTE Administrador e Financeiro. O RLS de `kits` deixa o Comercial
-- escrever, e isso continua certo para o que ele faz: montar kit dentro do
-- pedido. Tirar um item do catálogo, porém, é decisão de catálogo — muda o que
-- a equipe inteira consegue vender —, então a função tranca por papel.
--
-- SECURITY INVOKER de propósito: a alteração ainda passa pelo RLS da tabela,
-- e a política de auditoria (`audit_insert_own`) exige que a linha gravada
-- seja do próprio usuário. É o que garante que "quem inativou" seja mesmo
-- quem clicou, e não a função.
create or replace function public.set_kit_status(
  p_kit_id uuid,
  p_ativo boolean,
  p_motivo text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_papel text := public.current_user_role();
  v_atual record;
  v_novo entity_status := case when p_ativo then 'active' else 'inactive' end::entity_status;
  v_abertos bigint;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;
  if v_papel is null or v_papel not in ('admin', 'financeiro') then
    raise exception 'Somente Administrador e Financeiro podem ativar ou inativar um kit do catálogo';
  end if;

  select id, code, name, status into v_atual
    from public.kits
   where id = p_kit_id and tenant_id = v_tenant_id;
  if not found then
    raise exception 'Kit não encontrado';
  end if;

  -- Quantos orçamentos em aberto usam este kit. Vai no retorno e na auditoria:
  -- é o efeito colateral da inativação, e fica registrado o tamanho dele no
  -- momento em que a decisão foi tomada.
  select count(distinct oi.order_id) into v_abertos
    from public.order_items oi
    join public.orders o on o.id = oi.order_id and o.tenant_id = oi.tenant_id
   where oi.kit_id = p_kit_id
     and oi.tenant_id = v_tenant_id
     and o.status = 'simulation'
     and o.cancelled_at is null;

  if v_atual.status = v_novo then
    return jsonb_build_object(
      'tipo', 'sem_mudanca',
      'status', v_novo,
      'orcamentos_em_aberto', v_abertos
    );
  end if;

  update public.kits
     set status = v_novo,
         updated_at = now()
   where id = p_kit_id and tenant_id = v_tenant_id;
  if not found then
    raise exception 'Kit não encontrado';
  end if;

  insert into public.audit_logs (tenant_id, entity, entity_id, action, old_value, new_value, user_id)
  values (
    v_tenant_id,
    'kits',
    p_kit_id,
    case when p_ativo then 'activate' else 'deactivate' end,
    jsonb_build_object('status', v_atual.status),
    jsonb_build_object(
      'status', v_novo,
      'code', v_atual.code,
      'name', v_atual.name,
      'motivo', nullif(btrim(p_motivo), ''),
      'orcamentos_em_aberto', v_abertos
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'tipo', 'alterado',
    'status', v_novo,
    'orcamentos_em_aberto', v_abertos
  );
end $$;

revoke execute on function public.set_kit_status(uuid, boolean, text) from public, anon;
grant execute on function public.set_kit_status(uuid, boolean, text) to authenticated;

comment on function public.set_kit_status(uuid, boolean, text) is
  'Ativa ou inativa um kit no catálogo (Admin/Financeiro). Registra em audit_logs. Kit inativo nao pode ser vendido, mas mantem codigo e assinatura reservados.';
