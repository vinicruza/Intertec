-- Três correções pedidas pelo cliente em 30/07/2026, olhando o pedido de
-- exemplo (Hospital de Manaus) e a tela de Kits:
--
-- 1. "Do jeito que está parece que o próprio vendedor que gera o pedido pode
--    aprová-lo." — Verdade. decide_order_approval só checava o PERFIL de quem
--    decide, nunca se essa pessoa era quem tinha enviado a cotação. Um
--    Administrador que monta e envia a própria cotação podia aprová-la
--    sozinho, e isso não é aprovação — é só um clique a mais.
--
-- 2. "Rastrear a origem do kit é muito importante. Tudo deve ser rastreável."
--    — kits.created_by e created_at já existiam, mas nenhuma tela mostrava, e
--    faltava a ligação com o PEDIDO que deu origem ao kit — a informação mais
--    importante da rastreabilidade, porque é dali que se explica "por que essa
--    composição existe".
--
-- 3. O card de aprovação diz "confira preço de venda, CMV e margem de
--    contribuição acima antes de decidir" — mas o pedido pendente ainda está
--    em simulação, e CMV/margem só são gravados no FECHAMENTO (Decisão D7).
--    Ou seja: hoje o aprovador não vê CMV nem margem nenhuma, só o preço.
--    Corrigido no código do app (não requer mudança de banco): a tela passa a
--    calcular a cascata com os custos VIGENTES para exibição, sem gravar nada
--    — só o fechamento grava snapshot.
--
-- 4. DEFEITO ENCONTRADO TESTANDO O ITEM 1 — mais grave que os três de cima.
--    decide_order_approval, mark_order_lost e reopen_lost_order são
--    SECURITY INVOKER (rodam com o poder de quem chama, não do dono do banco)
--    e todas as três gravam em audit_logs. Mas audit_logs só tem política de
--    LEITURA (admin/financeiro) — a intenção sempre foi "escrita só por função
--    SECURITY DEFINER" (comentário original da migração 0005), só que essas
--    três nasceram INVOKER por descuido. Resultado: a gravação de auditoria
--    era barrada pelo RLS, e como o erro sobe sem tratamento, a FUNÇÃO INTEIRA
--    desfazia — ou seja, HOJE NINGUÉM CONSEGUE aprovar, recusar, marcar uma
--    cotação como perdida ou reabri-la. Confirmado no banco antes de corrigir.
--
--    A correção não é converter as três para DEFINER — cada uma dependeria de
--    reconstruir à mão a mesma checagem de quem pode alterar o pedido que o
--    RLS de `orders` já faz certo (Admin sempre; Comercial só em simulação).
--    Mais simples e mais seguro: dar à auditoria uma política de escrita
--    estreita — cada pessoa grava linha de auditoria SÓ da própria ação, no
--    próprio tenant. Não abre buraco: ninguém grava em nome de outro
--    (user_id trava em auth.uid()) nem em outro tenant.

-- ------------------------------------------------------------------
-- 1. Ninguém aprova a própria cotação
-- ------------------------------------------------------------------
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

  -- Segregação de funções: quem enviou não decide. Sem isto, aprovação vira
  -- só um clique a mais de quem já ia fechar o pedido de qualquer jeito.
  if v_order.submitted_by is not null and v_order.submitted_by = auth.uid() then
    raise exception 'Quem enviou esta cotação para aprovação não pode aprová-la. Peça que outra pessoa com perfil aprovador decida.';
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
-- 2. Origem do kit: de qual pedido ele nasceu
-- ------------------------------------------------------------------
-- Nulo = kit cadastrado manualmente na tela de Kits (não veio de um pedido).
alter table public.kits
  add column if not exists source_order_id uuid references public.orders (id);

create index if not exists kits_source_order_id_idx on public.kits (source_order_id);

comment on column public.kits.source_order_id is
  'Pedido cujo fechamento materializou este kit (reunião 16/07/2026: o código '
  'oficial só nasce quando o pedido é ganho). Nulo = cadastrado manualmente.';

-- Grava a origem no momento em que o kit nasce. Mesmo corpo da versão
-- corrente (20260729001300), só com a linha nova marcada.
create or replace function public.materialize_ad_hoc_kits(p_order_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_item record;
  v_kit_id uuid;
  v_nome text;
  v_criados integer := 0;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;

  for v_item in
    select id, ad_hoc_kit_signature, ad_hoc_kit_composition, ad_hoc_kit_packaging, ad_hoc_kit_label
      from public.order_items
     where order_id = p_order_id and tenant_id = v_tenant_id
       and ad_hoc_kit_composition is not null
  loop
    if nullif(btrim(v_item.ad_hoc_kit_signature), '') is null then
      raise exception 'Kit montado sem assinatura — não é possível materializar';
    end if;

    select id into v_kit_id from public.kits
     where tenant_id = v_tenant_id and signature = v_item.ad_hoc_kit_signature;

    if not found then
      v_nome := coalesce(nullif(btrim(v_item.ad_hoc_kit_label), ''), 'Kit do pedido');
      insert into public.kits (tenant_id, name, description, signature, created_by, source_order_id)
      values (v_tenant_id, v_nome, null, v_item.ad_hoc_kit_signature, auth.uid(), p_order_id)
      returning id into v_kit_id;

      insert into public.kit_items (tenant_id, kit_id, product_id, quantity)
      select v_tenant_id, v_kit_id, x.product_id, x.quantity
        from jsonb_to_recordset(v_item.ad_hoc_kit_composition) as x(product_id uuid, quantity numeric);

      if jsonb_typeof(v_item.ad_hoc_kit_packaging) = 'array'
         and jsonb_array_length(v_item.ad_hoc_kit_packaging) > 0 then
        insert into public.kit_packaging (tenant_id, kit_id, input_id, quantity_type, quantity, lot_size)
        select v_tenant_id, v_kit_id, x.input_id,
               coalesce(nullif(btrim(x.quantity_type), ''), 'direct'),
               x.quantity, x.lot_size
          from jsonb_to_recordset(v_item.ad_hoc_kit_packaging)
               as x(input_id uuid, quantity_type text, quantity numeric, lot_size numeric);
      end if;

      v_criados := v_criados + 1;
    end if;

    update public.order_items
       set kit_id = v_kit_id,
           ad_hoc_kit_signature = null,
           ad_hoc_kit_composition = null,
           ad_hoc_kit_packaging = null,
           ad_hoc_kit_label = null
     where id = v_item.id;
  end loop;

  return v_criados;
end $$;

-- ------------------------------------------------------------------
-- 3. Detalhe da origem, para a tela do kit
-- ------------------------------------------------------------------
-- O nome de quem criou vive em profiles, e RLS de profiles só deixa um
-- Administrador ler o perfil de outra pessoa (Sprint de acesso, 30/07/2026).
-- Sem isto, Financeiro/Comercial/Produção abririam um kit e não veriam quem
-- criou — a rastreabilidade pedida ficaria pela metade para 3 dos 4 perfis.
-- SECURITY DEFINER só para ESTA pergunta pontual (nome de quem criou UM kit
-- específico, que o próprio chamador já tem permissão de ver via kits_select);
-- não abre profiles de forma alguma.
create or replace function public.get_kit_origin(p_kit_id uuid)
returns table (
  created_by_name text,
  created_at timestamptz,
  source_order_id uuid,
  source_order_quote_number text,
  source_order_status text
)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.full_name, k.created_at, k.source_order_id, o.quote_number, o.status::text
    from public.kits k
    left join public.profiles p on p.id = k.created_by
    left join public.orders o on o.id = k.source_order_id
   where k.id = p_kit_id
     and k.tenant_id = public.current_tenant_id()
     and public.current_user_role() is not null;
$$;

revoke execute on function public.get_kit_origin(uuid) from public, anon;
grant execute on function public.get_kit_origin(uuid) to authenticated;

-- ------------------------------------------------------------------
-- 4. Auditoria volta a poder ser gravada por funções SECURITY INVOKER
-- ------------------------------------------------------------------
drop policy if exists audit_insert_own on public.audit_logs;
create policy audit_insert_own on public.audit_logs for insert to authenticated
with check (
  tenant_id = (select public.current_tenant_id())
  and user_id = (select auth.uid())
);
