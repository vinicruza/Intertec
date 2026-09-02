-- ============================================================
-- Retirada pelo cliente: uma opção de expedição sem valor de frete
-- Pedido da Intertech (Patrícia) em 02/09/2026.
-- ============================================================
--
-- "No caso de retirada, elas vão selecionar a opção 'Retirada', mas não existe
-- valor de frete, porque é o próprio cliente que retira. Mesmo assim o sistema
-- continua pedindo que seja registrado um valor."
--
-- A regra de 26/08/2026 — pelo menos uma cotação de frete, com transportadora
-- E valor maior que zero — continua valendo e pela mesma razão: cotação sem
-- valor é linha começada e abandonada, e o frete cotado é o que sustenta a
-- margem apresentada. O que faltava era reconhecer o caso em que não há frete
-- nenhum a cotar, porque a mercadoria não viaja: o cliente busca.
--
-- Retirada não é "frete de graça" nem campo esquecido — é OUTRA modalidade de
-- expedição. Por isso ela ganha uma marca própria na transportadora, e não uma
-- exceção no valor: qualquer linha zerada continua sendo recusada.
--
-- A dispensa vale só para a opção ESCOLHIDA (o botão "Escolhida" da tabela).
-- Deixar qualquer linha de retirada solta liberar o pedido devolveria pela
-- janela o que a regra fecha pela porta: bastaria acrescentar uma linha de
-- retirada a um pedido que vai viajar de transportadora para não cotar nada.

-- ------------------------------------------------------------------
-- 1. A marca na transportadora
-- ------------------------------------------------------------------
alter table public.carriers
  add column if not exists is_pickup boolean not null default false;

comment on column public.carriers.is_pickup is
  'Retirada pelo cliente: não há transporte pago, então a opção escolhida dispensa o valor do frete.';

-- A linha "RETIRADA" já existe em produção — foi criada à mão pela Intertech
-- em 02/09/2026, justamente tentando registrar o caso. Aqui ela só recebe a
-- marca; se não existir (banco novo, outro tenant), nasce agora.
insert into public.carriers (tenant_id, name, requires_name, sort_order, active, is_pickup)
select t.id, 'RETIRADA', false, 5, true, true
from public.tenants t
on conflict (tenant_id, name) do nothing;

update public.carriers
   set is_pickup = true,
       active = true
 where upper(btrim(name)) in ('RETIRADA', 'RETIRA', 'CLIENTE RETIRA', 'RETIRADA NO LOCAL');

-- ------------------------------------------------------------------
-- 2. O que conta como cotação de frete
-- ------------------------------------------------------------------
-- Passa a ser `stable` (antes `immutable`) porque agora consulta `carriers`
-- para saber se a transportadora da linha é retirada. Não é usada em índice
-- nem em coluna gerada — só no gatilho de fechamento e no envio para
-- aprovação, os dois logo abaixo —, então a troca não invalida nada.
--
-- `security definer` porque o gatilho de fechamento também roda assim: a
-- checagem não pode depender do perfil de quem apertou o botão para enxergar
-- a lista de transportadoras. Devolve só um booleano; não vaza linha nenhuma.
create or replace function public.tem_cotacao_de_frete(p_quotes jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_item jsonb;
  v_texto text;
  v_carrier text;
begin
  if p_quotes is null or jsonb_typeof(p_quotes) <> 'array' then return false; end if;

  for v_item in select value from jsonb_array_elements(p_quotes)
  loop
    v_carrier := nullif(btrim(coalesce(v_item->>'carrierId','')),'');
    if v_carrier is null
       and nullif(btrim(coalesce(v_item->>'carrierOther','')),'') is null then
      continue;
    end if;

    -- Retirada escolhida: o cliente busca, não há transporte a cotar.
    -- Comparação em jsonb (e não cast para boolean) porque `selected` é
    -- campo de um jsonb gravado pelo navegador: qualquer coisa pode chegar
    -- ali, e um cast estourando dentro do gatilho barraria o pedido com
    -- jargão de SQL em inglês.
    if (v_item->'selected') = to_jsonb(true)
       and v_carrier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and exists (
         select 1 from public.carriers c
          where c.id = v_carrier::uuid and c.is_pickup
       ) then
      return true;
    end if;

    -- O valor é digitado e guardado em texto. Normalmente chega normalizado
    -- ("384"), mas linhas antigas guardaram como a pessoa escreveu
    -- ("3.223,00"). Converte os dois formatos e ignora o que não for número,
    -- sem nunca deixar um cast estourar dentro do gatilho.
    v_texto := btrim(coalesce(v_item->>'amount',''));
    if position(',' in v_texto) > 0 then
      v_texto := replace(replace(v_texto, '.', ''), ',', '.');
    end if;
    if v_texto ~ '^-?[0-9]+([.][0-9]+)?$' and v_texto::numeric > 0 then
      return true;
    end if;
  end loop;

  return false;
end $$;

revoke execute on function public.tem_cotacao_de_frete(jsonb) from public, anon;
grant execute on function public.tem_cotacao_de_frete(jsonb) to authenticated;

-- ------------------------------------------------------------------
-- 3. A frase que a pessoa lê na tela
-- ------------------------------------------------------------------
-- A mensagem antiga mandava registrar um valor e não dizia o que fazer quando
-- valor não existe — foi exatamente o beco em que a Intertech ficou presa.
-- As duas portas (ganhar o pedido e enviar para aprovação) passam a dizer a
-- mesma frase, igual à da tela.
create or replace function public.protect_closed_order()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_expedicao text[] := array[
    'carrier_id', 'carrier_other', 'freight_quotes', 'weight_kg', 'volumes',
    'volumes_composition',
    'shipping_zip', 'shipping_city', 'shipping_state',
    'payment_term_id', 'payment_term_days', 'order_notes', 'updated_at'
  ];
begin
  if tg_op='DELETE' then
    if old.status='closed' or old.cancelled_at is not null then
      raise exception 'Pedido fechado ou cancelado não pode ser excluído';
    end if;
    return old;
  end if;

  if old.cancelled_at is not null then
    raise exception 'Pedido cancelado é imutável';
  end if;

  if new.cancelled_at is not null then
    if (to_jsonb(new)-'cancelled_at'-'cancelled_by'-'cancellation_reason'-'updated_at')
       <> (to_jsonb(old)-'cancelled_at'-'cancelled_by'-'cancellation_reason'-'updated_at') then
      raise exception 'Cancelamento não pode alterar os dados financeiros do pedido';
    end if;
    insert into public.audit_logs(tenant_id,entity,entity_id,action,old_value,new_value,user_id)
    values(old.tenant_id,'orders',old.id,'cancel',
      jsonb_build_object('status',old.status),
      jsonb_build_object('cancelled_at',new.cancelled_at,'reason',new.cancellation_reason),auth.uid());
    return new;
  end if;

  -- Pelo menos uma cotação de frete para o pedido ser GANHO (Intertech,
  -- 26/08/2026), ou a retirada marcada como escolhida (02/09/2026). Mora no
  -- gatilho porque é a passagem para 'closed' que precisa ser guardada, venha
  -- ela de qual caminho vier — e porque a tela sozinha não é garantia de nada.
  if new.status='closed' and old.status is distinct from 'closed'
     and not public.tem_cotacao_de_frete(new.freight_quotes) then
    raise exception 'Registre ao menos uma cotação de frete, com transportadora e valor, antes de prosseguir. Se o cliente for retirar, escolha a opção RETIRADA: nela não há valor de frete.';
  end if;

  if old.status='closed' then
    if (to_jsonb(new) - v_expedicao) is not distinct from (to_jsonb(old) - v_expedicao) then
      insert into public.audit_logs(tenant_id,entity,entity_id,action,old_value,new_value,user_id)
      values(old.tenant_id,'orders',old.id,'update_expedicao',
        jsonb_build_object(
          'carrier_id', old.carrier_id, 'carrier_other', old.carrier_other,
          'freight_quotes', old.freight_quotes,
          'weight_kg', old.weight_kg, 'volumes', old.volumes,
          'volumes_composition', old.volumes_composition,
          'shipping_zip', old.shipping_zip, 'shipping_city', old.shipping_city,
          'shipping_state', old.shipping_state, 'payment_term_id', old.payment_term_id,
          'payment_term_days', old.payment_term_days, 'order_notes', old.order_notes),
        jsonb_build_object(
          'carrier_id', new.carrier_id, 'carrier_other', new.carrier_other,
          'freight_quotes', new.freight_quotes,
          'weight_kg', new.weight_kg, 'volumes', new.volumes,
          'volumes_composition', new.volumes_composition,
          'shipping_zip', new.shipping_zip, 'shipping_city', new.shipping_city,
          'shipping_state', new.shipping_state, 'payment_term_id', new.payment_term_id,
          'payment_term_days', new.payment_term_days, 'order_notes', new.order_notes),
        auth.uid());
      return new;
    end if;

    raise exception 'Pedido fechado é imutável; crie uma revisão vinculada ao original';
  end if;
  return new;
end $$;

create or replace function public.submit_order_for_approval(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_order public.orders%rowtype;
  v_customer_shipping_zip text;
  v_carrier_requires_name boolean := false;
begin
  select * into v_order from public.orders
   where id = p_order_id and tenant_id = v_tenant_id;
  if not found then raise exception 'Cotação não encontrada'; end if;
  if v_order.status <> 'simulation' then
    raise exception 'Só cotação em aberto pode ser enviada para aprovação';
  end if;

  select shipping_zip into v_customer_shipping_zip
    from public.customers
   where id = v_order.customer_id
     and tenant_id = v_tenant_id;

  if not public.tem_cotacao_de_frete(v_order.freight_quotes) then
    raise exception 'Registre ao menos uma cotação de frete, com transportadora e valor, antes de prosseguir. Se o cliente for retirar, escolha a opção RETIRADA: nela não há valor de frete.';
  end if;

  if v_order.carrier_id is null then
    raise exception 'Preencha a transportadora antes de enviar para aprovação.';
  end if;

  select requires_name into v_carrier_requires_name
    from public.carriers
   where id = v_order.carrier_id
     and tenant_id = v_tenant_id;

  if coalesce(v_carrier_requires_name, false) and nullif(btrim(coalesce(v_order.carrier_other, '')), '') is null then
    raise exception 'Informe o nome da transportadora antes de enviar para aprovação.';
  end if;

  if v_order.payment_term_id is null and v_order.payment_term_days is null then
    raise exception 'Preencha o modo de pagamento antes de enviar para aprovação.';
  end if;

  if v_order.shipping_zip is null and v_customer_shipping_zip is null then
    raise exception 'Preencha o CEP de entrega antes de enviar para aprovação.';
  end if;

  update public.orders
     set approval_status = 'pendente',
         submitted_at = now(),
         submitted_by = auth.uid(),
         approved_at = null,
         approved_by = null
   where id = p_order_id and tenant_id = v_tenant_id;
end $$;

revoke execute on function public.submit_order_for_approval(uuid) from public, anon;
grant execute on function public.submit_order_for_approval(uuid) to authenticated;

-- ------------------------------------------------------------------
-- 4. Marcar a retirada pelo cadastro de transportadoras
-- ------------------------------------------------------------------
-- A marca precisa ser da Intertech, não do código: se amanhã a retirada tiver
-- outro nome, o Administrador resolve na tela de Cadastros. Assinatura nova
-- (a antiga sai, para não existirem duas funções com o mesmo nome).
drop function if exists public.save_carrier(uuid, text, integer, boolean);

create or replace function public.save_carrier(
  p_id uuid,
  p_name text,
  p_sort_order integer,
  p_active boolean,
  p_is_pickup boolean
)
returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_tenant_id uuid := public.current_tenant_id(); v_id uuid := p_id;
begin
  if not public.has_role('admin') then
    raise exception 'Sem permissão para alterar as transportadoras';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Informe o nome da transportadora';
  end if;

  if v_id is null then
    insert into public.carriers (tenant_id, name, sort_order, active, is_pickup)
    values (v_tenant_id, btrim(p_name), coalesce(p_sort_order, 0), coalesce(p_active, true),
            coalesce(p_is_pickup, false))
    returning id into v_id;
  else
    -- `requires_name` não entra: é característica da linha "Outra", que existe
    -- para pedir o nome de quem não está na lista. Renomear é permitido;
    -- transformar uma transportadora comum em "Outra" pela tela, não.
    update public.carriers
       set name = btrim(p_name),
           sort_order = coalesce(p_sort_order, 0),
           active = coalesce(p_active, true),
           is_pickup = coalesce(p_is_pickup, false)
     where id = v_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Transportadora não encontrada'; end if;
  end if;
  return v_id;
end $$;

revoke execute on function public.save_carrier(uuid, text, integer, boolean, boolean) from public, anon;
grant execute on function public.save_carrier(uuid, text, integer, boolean, boolean) to authenticated;
