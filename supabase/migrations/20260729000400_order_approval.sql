-- Sprint C — Aprovação do pedido e visibilidade da margem.
-- Reunião Intertech 16/07/2026 + decisão do cliente em 29/07/2026
-- ("quem aprova: configurável por perfil").
--
-- O problema que isto resolve, nas palavras da reunião: "é humanamente
-- impossível controlar; elas pegam 200 papéis por dia e colocam na pasta".
-- O pedido passa a subir para aprovação com preço de venda, CMV e margem de
-- contribuição visíveis a quem aprova.

-- ------------------------------------------------------------------
-- 1. Parâmetros de aprovação (editáveis pelo Administrador)
-- ------------------------------------------------------------------
create table if not exists public.approval_settings (
  tenant_id uuid primary key references public.tenants (id),
  -- Quem pode aprovar. Perfis, não pessoas — a reunião não fechou se é a Cris
  -- ou a Michelle, e isso é decisão operacional que muda com o tempo.
  approver_roles text[] not null default array['admin', 'financeiro'],
  -- Exigir aprovação para fechar o pedido.
  require_approval boolean not null default true,
  -- Trava opcional por margem: abaixo disto, ninguém aprova.
  -- Fica NULO de propósito. Na reunião: "eu deixaria nulo para o começo, só
  -- para ver o que elas estão fazendo" — primeiro dar visibilidade, depois
  -- decidir se trava.
  block_below_margin numeric,
  -- Esconder o percentual de margem do perfil Comercial, deixando só a cor.
  -- Também é decisão da reunião: vendo o número, a pessoa desconta até raspar
  -- o limite; vendo só a cor, "se tiver só verde, pode estar 80%, ela não vai
  -- saber".
  hide_margin_numbers_from_sales boolean not null default true,
  updated_at timestamptz,
  check (array_length(approver_roles, 1) >= 1),
  check (block_below_margin is null or (block_below_margin >= 0 and block_below_margin <= 1))
);

alter table public.approval_settings enable row level security;

create policy approval_settings_select on public.approval_settings for select
  using (tenant_id = public.current_tenant_id() and public.current_user_role() is not null);
create policy approval_settings_write on public.approval_settings for all
  using (tenant_id = public.current_tenant_id() and public.current_user_role() = 'admin')
  with check (tenant_id = public.current_tenant_id() and public.current_user_role() = 'admin');

grant select, insert, update on public.approval_settings to authenticated;

drop trigger if exists trg_approval_settings_updated_at on public.approval_settings;
create trigger trg_approval_settings_updated_at before update on public.approval_settings
  for each row execute function public.set_updated_at();

insert into public.approval_settings (tenant_id)
select id from public.tenants
on conflict (tenant_id) do nothing;

-- ------------------------------------------------------------------
-- 2. Estado de aprovação no pedido
-- ------------------------------------------------------------------
do $$ begin
  create type approval_status as enum ('rascunho', 'pendente', 'aprovado', 'recusado');
exception when duplicate_object then null;
end $$;

alter table public.orders
  add column if not exists approval_status approval_status not null default 'rascunho',
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references public.profiles (id),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles (id),
  add column if not exists approval_notes text;

create index if not exists orders_approval_status_idx
  on public.orders (tenant_id, approval_status);

-- Pedidos já fechados antes desta migração são considerados aprovados: o
-- controle não existia, e marcá-los como pendentes seria reescrever o passado.
--
-- Como no backfill do número de orçamento, a trava de imutabilidade sai
-- durante a operação: ela barra qualquer UPDATE em pedido fechado, e aqui só
-- se preenche um campo de controle que passou a existir agora. Nenhum valor
-- financeiro é tocado, e a trava volta na sequência.
alter table public.orders disable trigger trg_orders_immutable;

update public.orders
   set approval_status = 'aprovado',
       approved_at = coalesce(approved_at, closed_at)
 where status = 'closed' and approval_status = 'rascunho';

alter table public.orders enable trigger trg_orders_immutable;

-- ------------------------------------------------------------------
-- 3. Enviar para aprovação / aprovar / recusar
-- ------------------------------------------------------------------
create or replace function public.submit_order_for_approval(p_order_id uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_tenant_id uuid := public.current_tenant_id(); v_status order_status;
begin
  select status into v_status from public.orders
   where id = p_order_id and tenant_id = v_tenant_id;
  if not found then raise exception 'Cotação não encontrada'; end if;
  if v_status <> 'simulation' then
    raise exception 'Só cotação em aberto pode ser enviada para aprovação';
  end if;

  update public.orders
     set approval_status = 'pendente', submitted_at = now(), submitted_by = auth.uid(),
         approved_at = null, approved_by = null
   where id = p_order_id and tenant_id = v_tenant_id;
end $$;

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

  -- Trava por margem, quando o Administrador tiver configurado uma.
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
         approved_at = now(), approved_by = auth.uid(),
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

-- ------------------------------------------------------------------
-- 4. Fechar exige aprovação, quando configurado
-- ------------------------------------------------------------------
create or replace function public.assert_order_approved(p_order_id uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_cfg public.approval_settings%rowtype;
  v_approval approval_status;
begin
  select * into v_cfg from public.approval_settings where tenant_id = v_tenant_id;
  if not found or not v_cfg.require_approval then return; end if;

  select approval_status into v_approval from public.orders
   where id = p_order_id and tenant_id = v_tenant_id;
  if v_approval is distinct from 'aprovado' then
    raise exception 'Pedido precisa estar aprovado antes do fechamento';
  end if;
end $$;

revoke execute on function public.submit_order_for_approval(uuid) from public, anon;
revoke execute on function public.decide_order_approval(uuid, boolean, text) from public, anon;
revoke execute on function public.assert_order_approved(uuid) from public, anon;
grant execute on function public.submit_order_for_approval(uuid) to authenticated;
grant execute on function public.decide_order_approval(uuid, boolean, text) to authenticated;
grant execute on function public.assert_order_approved(uuid) to authenticated;

-- ------------------------------------------------------------------
-- 5. Gravação dos parâmetros (só Administrador)
-- ------------------------------------------------------------------
-- Via função, como as demais escritas do projeto: evita depender do cliente
-- conhecer o tenant e mantém a validação junto da regra.
create or replace function public.save_approval_settings(
  p_approver_roles text[],
  p_require_approval boolean,
  p_block_below_margin numeric,
  p_hide_margin_numbers_from_sales boolean
)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_tenant_id uuid := public.current_tenant_id();
begin
  if v_tenant_id is null then raise exception 'Usuário sem tenant ativo'; end if;
  if not public.has_role('admin') then
    raise exception 'Apenas o Administrador altera os parâmetros de aprovação';
  end if;
  if p_approver_roles is null or array_length(p_approver_roles, 1) is null then
    raise exception 'Escolha ao menos um perfil aprovador';
  end if;
  if exists (select 1 from unnest(p_approver_roles) r
              where r not in ('admin', 'financeiro', 'comercial', 'producao')) then
    raise exception 'Perfil aprovador inválido';
  end if;

  insert into public.approval_settings as a
    (tenant_id, approver_roles, require_approval, block_below_margin, hide_margin_numbers_from_sales)
  values (v_tenant_id, p_approver_roles, p_require_approval, p_block_below_margin,
          p_hide_margin_numbers_from_sales)
  on conflict (tenant_id) do update
    set approver_roles = excluded.approver_roles,
        require_approval = excluded.require_approval,
        block_below_margin = excluded.block_below_margin,
        hide_margin_numbers_from_sales = excluded.hide_margin_numbers_from_sales;
end $$;

revoke execute on function public.save_approval_settings(text[], boolean, numeric, boolean) from public, anon;
grant execute on function public.save_approval_settings(text[], boolean, numeric, boolean) to authenticated;
