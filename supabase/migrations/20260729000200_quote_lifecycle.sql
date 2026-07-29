-- Sprint B — Ciclo comercial, conforme a reunião Intertech de 16/07/2026.
--
-- Decisões que esta migração implementa:
--  * Toda cotação fica registrada e recebe um NÚMERO DE ORÇAMENTO próprio,
--    que não é o código do kit ("a gente tem dois tipos de código, código de
--    orçamento e código de pedido").
--  * Um cliente pede 15 variações antes de fechar. Cada edição vira uma
--    VERSÃO registrada, para depois se analisar o que foi cotado e não vendeu.
--  * Cotação que não vinga é marcada como PERDIDA com MOTIVO — a empresa quer
--    responder "por que não vendemos?" com preço de venda e custo à mão.
--  * O CÓDIGO OFICIAL DO KIT só nasce quando o pedido é ganho. Enquanto é
--    cotação, a composição do kit fica gravada no próprio item do pedido, sem
--    poluir o catálogo com centenas de kits que nunca serão usados.

-- ------------------------------------------------------------------
-- 1. Status "perdido"
-- ------------------------------------------------------------------
alter type order_status add value if not exists 'lost';

-- ------------------------------------------------------------------
-- 2. Motivos de perda (tabela editável — a lista definitiva é do cliente)
-- ------------------------------------------------------------------
create table if not exists public.loss_reasons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (tenant_id, label)
);

alter table public.loss_reasons enable row level security;

create policy loss_reasons_select on public.loss_reasons for select
  using (tenant_id = public.current_tenant_id() and public.current_user_role() is not null);
create policy loss_reasons_write on public.loss_reasons for all
  using (tenant_id = public.current_tenant_id() and public.current_user_role() in ('admin', 'financeiro'))
  with check (tenant_id = public.current_tenant_id() and public.current_user_role() in ('admin', 'financeiro'));

grant select, insert, update, delete on public.loss_reasons to authenticated;

drop trigger if exists trg_loss_reasons_updated_at on public.loss_reasons;
create trigger trg_loss_reasons_updated_at before update on public.loss_reasons
  for each row execute function public.set_updated_at();

-- Partida sugerida. "Preço" é o motivo citado na reunião; o resto o cliente
-- ajusta na tela de Configurações.
insert into public.loss_reasons (tenant_id, label, sort_order)
select t.id, v.label, v.sort_order
from public.tenants t cross join (values
  ('Preço', 10),
  ('Prazo de entrega', 20),
  ('Concorrência', 30),
  ('Cliente desistiu da compra', 40),
  ('Não conseguimos atender a especificação', 50),
  ('Sem retorno do cliente', 60),
  ('Outro', 99)
) as v(label, sort_order)
on conflict (tenant_id, label) do nothing;

-- ------------------------------------------------------------------
-- 3. Número de orçamento e desfecho da cotação
-- ------------------------------------------------------------------
alter table public.orders
  add column if not exists quote_number text,
  add column if not exists lost_at timestamptz,
  add column if not exists lost_by uuid references public.profiles (id),
  add column if not exists loss_reason_id uuid references public.loss_reasons (id),
  add column if not exists loss_notes text;

create unique index if not exists orders_quote_number_unique
  on public.orders (tenant_id, quote_number) where quote_number is not null;
create index if not exists orders_loss_reason_idx on public.orders (tenant_id, loss_reason_id);

comment on column public.orders.quote_number is
  'Número do orçamento (ORC-AAAA-NNNN). Identifica a cotação para rastrear o '
  'que não virou venda. Não é o código do kit.';

create or replace function public.next_quote_number(p_tenant_id uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ano text := to_char(now(), 'YYYY');
  v_next integer;
begin
  perform pg_advisory_xact_lock(hashtext('quote:' || p_tenant_id::text || ':' || v_ano));
  select coalesce(max(substring(quote_number from '[0-9]+$')::integer), 0) + 1
    into v_next
    from public.orders
   where tenant_id = p_tenant_id
     and quote_number like 'ORC-' || v_ano || '-%';
  return 'ORC-' || v_ano || '-' || lpad(v_next::text, 4, '0');
end $$;

create or replace function public.set_quote_number()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.quote_number is null then
    new.quote_number := public.next_quote_number(new.tenant_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_quote_number on public.orders;
create trigger trg_orders_quote_number before insert on public.orders
  for each row execute function public.set_quote_number();

-- Numera as cotações já existentes, em ordem de criação, reiniciando a
-- sequência a cada tenant e a cada ano (mesmo formato de next_quote_number).
with numeradas as (
  select id,
         'ORC-' || to_char(created_at, 'YYYY') || '-' ||
         lpad(row_number() over (
           partition by tenant_id, to_char(created_at, 'YYYY')
           order by created_at, id
         )::text, 4, '0') as numero
    from public.orders
   where quote_number is null
)
update public.orders o
   set quote_number = n.numero
  from numeradas n
 where n.id = o.id;

-- ------------------------------------------------------------------
-- 4. Versões da cotação
-- ------------------------------------------------------------------
-- "Se ele faz 10 alterações, nós vamos registrar as 10?" — sim. Cada gravação
-- da cotação empilha uma versão com a foto do que foi cotado.
create table if not exists public.order_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  order_id uuid not null references public.orders (id) on delete cascade,
  version integer not null check (version > 0),
  -- Foto da cotação: itens, parâmetros e totais calculados no momento.
  snapshot jsonb not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (order_id, version)
);

create index if not exists order_versions_tenant_id_idx on public.order_versions (tenant_id);
create index if not exists order_versions_order_id_idx on public.order_versions (order_id, version desc);

alter table public.order_versions enable row level security;

create policy order_versions_select on public.order_versions for select
  using (tenant_id = public.current_tenant_id() and public.current_user_role() is not null);
create policy order_versions_insert on public.order_versions for insert
  with check (tenant_id = public.current_tenant_id()
              and public.current_user_role() in ('admin', 'financeiro', 'comercial'));

grant select, insert on public.order_versions to authenticated;

-- ------------------------------------------------------------------
-- 5. Kit montado dentro do pedido, ainda sem código oficial
-- ------------------------------------------------------------------
-- Enquanto é cotação, a composição vive no item do pedido. Ao ganhar, ela é
-- materializada em kit (criando ou reaproveitando, pela assinatura) e ganha o
-- código oficial que vai para a nota fiscal.
alter table public.order_items
  add column if not exists ad_hoc_kit_signature text,
  add column if not exists ad_hoc_kit_composition jsonb,
  add column if not exists ad_hoc_kit_packaging jsonb,
  add column if not exists ad_hoc_kit_label text;

-- Exatamente um: produto, kit já cadastrado, ou kit montado na hora.
alter table public.order_items drop constraint if exists order_items_check;
alter table public.order_items drop constraint if exists order_items_one_ref;
alter table public.order_items add constraint order_items_one_ref
  check (num_nonnulls(product_id, kit_id, ad_hoc_kit_composition) = 1);

comment on column public.order_items.ad_hoc_kit_composition is
  'Composição do kit montado dentro do simulador, antes de virar kit oficial. '
  'Materializada em kits/kit_items quando o pedido é ganho.';
