-- Expedição e condições do pedido — formulário de pedido, 05/08/2026.
--
-- O formulário de papel tem, embaixo dos itens, um bloco que o sistema não
-- tinha em lugar nenhum: peso, volume, transportadora, prazo de pagamento e
-- observação. É o que a expedição lê para despachar e o que o financeiro lê
-- para cobrar. Sem esses campos, a ficha impressa saía pela metade e a
-- informação continuava vivendo à mão, no papel.
--
-- NÃO entra aqui o bloco fiscal do formulário (ST, FCP separado e o TOTAL a
-- cobrar). O ST ainda vai ser confirmado com a Intertech, e o tratamento de
-- DIFAL/FCP depende de uma regra ("depende do cliente") que ainda não foi
-- definida. Mexer na cascata antes disso alteraria a margem de todo pedido.

-- ------------------------------------------------------------------
-- 1. Transportadoras
-- ------------------------------------------------------------------
-- Tabela editável, não enum, pela mesma razão dos tipos de cliente: a lista
-- do formulário é a de hoje. Transportadora se troca por preço de frete, e
-- trocar não pode exigir publicar código.
create table if not exists public.carriers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null check (btrim(name) <> ''),
  -- "Outra" existe no formulário e não é uma transportadora: é o pedido para
  -- escrever qual. A flag faz a tela pedir o nome em vez de aceitar em branco.
  requires_name boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (tenant_id, name)
);

alter table public.carriers enable row level security;
create policy carriers_select on public.carriers for select
  using (tenant_id = public.current_tenant_id() and public.current_user_role() is not null);
create policy carriers_write on public.carriers for all
  using (tenant_id = public.current_tenant_id() and public.current_user_role() in ('admin','financeiro'))
  with check (tenant_id = public.current_tenant_id() and public.current_user_role() in ('admin','financeiro'));
grant select, insert, update, delete on public.carriers to authenticated;
create trigger trg_carriers_updated_at before update on public.carriers
  for each row execute function public.set_updated_at();

-- Semente: exatamente as opções impressas no formulário, na mesma ordem. A
-- tela nasce igual ao papel que a equipe já usa.
insert into public.carriers (tenant_id, name, requires_name, sort_order)
select t.id, v.nome, v.pede_nome, v.ordem
from public.tenants t cross join (values
  ('Sedex/Pac',   false, 10),
  ('Braspress',   false, 20),
  ('Aero',        false, 30),
  ('Rodonaves',   false, 40),
  ('Jamef',       false, 50),
  ('Transwells',  false, 60),
  ('Outra',       true,  70)
) as v(nome, pede_nome, ordem)
on conflict (tenant_id, name) do nothing;

-- ------------------------------------------------------------------
-- 2. Expedição e condições no pedido
-- ------------------------------------------------------------------
alter table public.orders
  add column if not exists carrier_id uuid references public.carriers (id),
  -- Preenchido só quando a transportadora escolhida é a "Outra".
  add column if not exists carrier_other text,
  add column if not exists weight_kg numeric check (weight_kg is null or weight_kg > 0),
  add column if not exists volumes integer check (volumes is null or volumes > 0),
  -- CEP de entrega DESTE pedido. O padrão vem do cadastro do cliente; aqui
  -- fica o desvio, quando a caixa vai para um endereço diferente do de sempre.
  -- Guardar o desvio no pedido, e não sobrescrever o cadastro, é o que impede
  -- que uma entrega excepcional vire o endereço permanente do cliente.
  add column if not exists shipping_zip text,
  -- "Pagamento ____ dias" do formulário.
  add column if not exists payment_term_days integer
    check (payment_term_days is null or payment_term_days >= 0),
  add column if not exists order_notes text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_shipping_zip_formato') then
    alter table public.orders add constraint orders_shipping_zip_formato
      check (shipping_zip is null or shipping_zip ~ '^[0-9]{8}$');
  end if;
end $$;

-- ------------------------------------------------------------------
-- 3. Expedição pode ser preenchida DEPOIS do fechamento
-- ------------------------------------------------------------------
-- Peso e volume não existem na hora de fechar o pedido: são conhecidos quando
-- alguém embala a caixa, e no papel de hoje são escritos à mão nessa hora. Com
-- a regra de imutabilidade como estava, o pedido fechado recusava qualquer
-- alteração e esses campos nasceriam mortos.
--
-- A decisão D7 congela o DINHEIRO — CMV, despesa, alíquotas, comissão e frete
-- do momento da venda. Ela não diz que o peso da caixa não pode ser digitado.
-- Então a proteção passa a comparar coluna a coluna: se a alteração tocou
-- QUALQUER campo fora desta lista, continua sendo recusada como antes. Não é
-- uma exceção de confiança, é uma exceção verificada pelo próprio banco.
--
-- Esta versão parte da que está valendo hoje (migração 20260715000600, ciclo
-- de cancelamento) e acrescenta só o trecho da expedição. Pedido CANCELADO
-- segue imutável para tudo, inclusive expedição: caixa que não vai ser
-- despachada não tem peso a registrar.
create or replace function public.protect_closed_order()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  -- Campos que a expedição preenche depois, mais o carimbo de atualização.
  v_expedicao text[] := array[
    'carrier_id', 'carrier_other', 'weight_kg', 'volumes',
    'shipping_zip', 'order_notes', 'updated_at'
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

  if old.status='closed' then
    -- Tirando os campos de expedição dos dois lados, sobrou diferença? Se
    -- sobrou, a alteração mexeu em algo que é imutável.
    if (to_jsonb(new) - v_expedicao) is not distinct from (to_jsonb(old) - v_expedicao) then
      insert into public.audit_logs(tenant_id,entity,entity_id,action,old_value,new_value,user_id)
      values(old.tenant_id,'orders',old.id,'update_expedicao',
        jsonb_build_object(
          'carrier_id', old.carrier_id, 'carrier_other', old.carrier_other,
          'weight_kg', old.weight_kg, 'volumes', old.volumes,
          'shipping_zip', old.shipping_zip, 'order_notes', old.order_notes),
        jsonb_build_object(
          'carrier_id', new.carrier_id, 'carrier_other', new.carrier_other,
          'weight_kg', new.weight_kg, 'volumes', new.volumes,
          'shipping_zip', new.shipping_zip, 'order_notes', new.order_notes),
        auth.uid());
      return new;
    end if;

    raise exception 'Pedido fechado é imutável; crie uma revisão vinculada ao original';
  end if;
  return new;
end $$;

revoke execute on function public.protect_closed_order() from public,anon,authenticated;

-- ------------------------------------------------------------------
-- 4. Gravar expedição num pedido já fechado
-- ------------------------------------------------------------------
-- Função dedicada porque a tela precisa de um caminho estreito: escrever só
-- estes campos, sem chegar perto do resto da linha.
--
-- Ela é `security definer` por um motivo específico: pela RLS, só o
-- Administrador altera pedido FECHADO, e quem embala a caixa não é
-- Administrador. Em vez de afrouxar a RLS — que é a garantia geral e vale
-- para qualquer comando —, abre-se esta porta única, que só sabe escrever
-- sete colunas e confere o perfil ela mesma. O gatilho acima continua sendo
-- a trava: se um dia esta função mudar e tentar tocar em dinheiro, o banco
-- recusa e registra.
create or replace function public.update_order_shipping(
  p_order_id uuid,
  p_carrier_id uuid,
  p_carrier_other text,
  p_weight_kg numeric,
  p_volumes integer,
  p_shipping_zip text,
  p_order_notes text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_role public.user_role := public.current_user_role();
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;
  if v_role not in ('admin', 'financeiro', 'comercial') then
    raise exception 'Sem permissão para registrar a expedição do pedido';
  end if;
  -- A transportadora precisa existir e ser deste tenant: `security definer`
  -- passa por cima da RLS, então a checagem que ela faria vem escrita aqui.
  if p_carrier_id is not null and not exists (
    select 1 from public.carriers
     where id = p_carrier_id and tenant_id = v_tenant_id and active
  ) then
    raise exception 'Transportadora inválida';
  end if;

  update public.orders
     set carrier_id = p_carrier_id,
         carrier_other = nullif(btrim(p_carrier_other), ''),
         weight_kg = p_weight_kg,
         volumes = p_volumes,
         shipping_zip = nullif(regexp_replace(coalesce(p_shipping_zip, ''), '\D', '', 'g'), ''),
         order_notes = nullif(btrim(p_order_notes), '')
   where id = p_order_id
     and tenant_id = v_tenant_id
     and cancelled_at is null;

  if not found then
    raise exception 'Pedido não encontrado ou cancelado';
  end if;
end $$;

revoke execute on function public.update_order_shipping(uuid, uuid, text, numeric, integer, text, text)
  from public, anon;
grant execute on function public.update_order_shipping(uuid, uuid, text, numeric, integer, text, text)
  to authenticated;

-- ------------------------------------------------------------------
-- 5. Duplicar/revisar pedido carrega as condições combinadas
-- ------------------------------------------------------------------
-- Transportadora, CEP de entrega e prazo de pagamento são acordos com aquele
-- cliente: repetem de um pedido para o outro, e redigitar convida ao erro.
-- Peso, volume e observação NÃO vêm junto de propósito — são fatos daquela
-- caixa específica, e herdá-los faria a ficha nova nascer mentindo sobre o
-- que ainda nem foi embalado.
create or replace function public.copy_order_as_simulation(p_order_id uuid, p_reason text default 'duplicate')
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_source public.orders%rowtype;
  v_new_id uuid;
begin
  select * into v_source from public.orders
   where id = p_order_id and tenant_id = v_tenant_id;
  if not found then raise exception 'Pedido não encontrado'; end if;

  insert into public.orders
    (tenant_id, status, customer_id, uf, seller_id, channel_id, freight,
     freight_paid_by_customer, commission_rate, created_by, revised_from_order_id, revision_reason,
     carrier_id, carrier_other, shipping_zip, payment_term_days)
  values
    (v_tenant_id, 'simulation', v_source.customer_id, v_source.uf, v_source.seller_id,
     v_source.channel_id, v_source.freight, v_source.freight_paid_by_customer,
     v_source.commission_rate, auth.uid(),
     case when v_source.status = 'closed' then v_source.id else v_source.revised_from_order_id end,
     nullif(btrim(p_reason), ''),
     v_source.carrier_id, v_source.carrier_other, v_source.shipping_zip, v_source.payment_term_days)
  returning id into v_new_id;

  insert into public.order_items
    (tenant_id, order_id, product_id, kit_id, quantity, unit_price)
  select v_tenant_id, v_new_id, product_id, kit_id, quantity, unit_price
    from public.order_items where order_id = p_order_id;

  return v_new_id;
end;
$$;

revoke execute on function public.copy_order_as_simulation(uuid, text) from public, anon;
grant execute on function public.copy_order_as_simulation(uuid, text) to authenticated;

-- ------------------------------------------------------------------
-- 6. Manter a lista de transportadoras pela tela de Cadastros
-- ------------------------------------------------------------------
create or replace function public.save_carrier(
  p_id uuid,
  p_name text,
  p_sort_order integer,
  p_active boolean
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
    insert into public.carriers (tenant_id, name, sort_order, active)
    values (v_tenant_id, btrim(p_name), coalesce(p_sort_order, 0), coalesce(p_active, true))
    returning id into v_id;
  else
    -- `requires_name` não entra: é característica da linha "Outra", que existe
    -- para pedir o nome de quem não está na lista. Renomear é permitido;
    -- transformar uma transportadora comum em "Outra" pela tela, não.
    update public.carriers
       set name = btrim(p_name),
           sort_order = coalesce(p_sort_order, 0),
           active = coalesce(p_active, true)
     where id = v_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Transportadora não encontrada'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.delete_carrier(p_id uuid)
returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_role('admin') then
    raise exception 'Sem permissão para excluir transportadoras';
  end if;
  -- Pedido já despachado guarda qual transportadora levou a caixa. Apagar a
  -- linha apagaria essa informação de pedidos passados; desativar preserva o
  -- histórico e some da lista de escolha.
  if exists (select 1 from public.orders where carrier_id = p_id and tenant_id = v_tenant_id) then
    raise exception 'Esta transportadora já foi usada em pedido; desative em vez de excluir';
  end if;
  delete from public.carriers where id = p_id and tenant_id = v_tenant_id;
  if not found then raise exception 'Transportadora não encontrada'; end if;
end $$;

revoke execute on function public.save_carrier(uuid, text, integer, boolean) from public, anon;
revoke execute on function public.delete_carrier(uuid) from public, anon;
grant execute on function public.save_carrier(uuid, text, integer, boolean) to authenticated;
grant execute on function public.delete_carrier(uuid) to authenticated;
