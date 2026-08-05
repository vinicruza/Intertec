-- Reabrir um pedido em aberto para editar — 05/08/2026.
--
-- Achado revisando um pedido de teste: não existia NENHUM caminho de volta
-- ao Simulador depois de sair dele — nem "Duplicar como nova simulação"
-- levava a algum editor. `save_quote_revision` já suportava atualizar um
-- pedido existente (parâmetro `p_order_id`), mas só checava `orders.status`
-- (simulation | closed | lost) — nunca `approval_status`.
--
-- Sem esta migração, um botão "Editar" na tela deixaria alguém trocar preço
-- ou item de um pedido JÁ APROVADO, ou AINDA AGUARDANDO decisão, sem que a
-- aprovação (ou a pessoa aprovando) tivesse qualquer chance de ver o número
-- novo. Isso anularia a razão de existir da aprovação (docs/09
-- Aprovação-e-Rastreabilidade, item 2: "ninguém aprova a própria cotação" —
-- o mesmo princípio vale aqui: ninguém edita por baixo de uma aprovação já
-- dada ou em curso).
--
-- Regra: só edita quem está em `rascunho` (nunca enviado) ou `recusado`
-- (voltou para a mesa). Editar um `recusado` devolve a `rascunho`
-- automaticamente — a decisão de recusa valia para os números antigos, não
-- para os novos, então precisa passar pela aprovação de novo.
create or replace function public.save_quote_revision(
  p_order_id uuid,
  p_order jsonb,
  p_items jsonb,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_order_id uuid := p_order_id;
  v_customer_id uuid;
  v_version integer;
  v_status order_status;
  v_approval approval_status;
  v_carrier_id uuid := nullif(p_order->>'carrier_id', '')::uuid;
  v_carrier_other text := nullif(btrim(p_order->>'carrier_other'), '');
  v_weight_kg numeric := nullif(p_order->>'weight_kg', '')::numeric;
  v_volumes integer := nullif(p_order->>'volumes', '')::integer;
  v_shipping_zip text := nullif(regexp_replace(coalesce(p_order->>'shipping_zip', ''), '\D', '', 'g'), '');
  v_payment_term integer := nullif(p_order->>'payment_term_days', '')::integer;
  v_order_notes text := nullif(btrim(p_order->>'order_notes'), '');
  v_applies_difal boolean;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cotação sem itens';
  end if;

  v_customer_id := nullif(p_order->>'customer_id', '')::uuid;
  if v_customer_id is null and nullif(btrim(p_order->>'customer_name'), '') is not null then
    insert into public.customers (tenant_id, name, uf)
    values (v_tenant_id, btrim(p_order->>'customer_name'), p_order->>'uf')
    returning id into v_customer_id;
  end if;

  v_applies_difal := coalesce(
    (p_order->>'applies_difal')::boolean,
    (select applies_difal from public.channels where id = (p_order->>'channel_id')::uuid),
    true
  );

  if v_order_id is null then
    insert into public.orders (tenant_id, status, customer_id, uf, seller_id, channel_id,
                               freight, freight_paid_by_customer, commission_rate, applies_difal, created_by,
                               carrier_id, carrier_other, weight_kg, volumes, shipping_zip,
                               payment_term_days, order_notes)
    values (v_tenant_id, 'simulation', v_customer_id, p_order->>'uf',
            (p_order->>'seller_id')::uuid, (p_order->>'channel_id')::uuid,
            (p_order->>'freight')::numeric, (p_order->>'freight_paid_by_customer')::boolean,
            (p_order->>'commission_rate')::numeric, v_applies_difal, auth.uid(),
            v_carrier_id, v_carrier_other, v_weight_kg, v_volumes, v_shipping_zip,
            v_payment_term, v_order_notes)
    returning id into v_order_id;
  else
    select status, approval_status into v_status, v_approval from public.orders
     where id = v_order_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Cotação não encontrada'; end if;
    if v_status <> 'simulation' then
      raise exception 'Só é possível editar cotação em aberto; esta já foi ganha ou perdida';
    end if;
    -- A fonte da verdade é o BANCO, não a tela: a tela nem oferece o botão
    -- Editar fora de rascunho/recusado, mas quem chamasse a função direto
    -- (ou uma aba antiga aberta) não podia contornar a regra.
    if v_approval = 'pendente' then
      raise exception 'Cotação aguardando aprovação não pode ser editada; aguarde a decisão';
    end if;
    if v_approval = 'aprovado' then
      raise exception 'Cotação já aprovada não pode ser editada; feche o pedido ou peça para recusarem a aprovação';
    end if;

    update public.orders
       set customer_id = coalesce(v_customer_id, customer_id),
           uf = p_order->>'uf',
           seller_id = (p_order->>'seller_id')::uuid,
           channel_id = (p_order->>'channel_id')::uuid,
           freight = (p_order->>'freight')::numeric,
           freight_paid_by_customer = (p_order->>'freight_paid_by_customer')::boolean,
           commission_rate = (p_order->>'commission_rate')::numeric,
           applies_difal = v_applies_difal,
           carrier_id = v_carrier_id,
           carrier_other = v_carrier_other,
           weight_kg = v_weight_kg,
           volumes = v_volumes,
           shipping_zip = v_shipping_zip,
           payment_term_days = v_payment_term,
           order_notes = v_order_notes,
           -- Editar uma cotação recusada volta para rascunho: a recusa foi
           -- sobre os números antigos, e os novos ainda não passaram por
           -- ninguém. Limpa o rastro da decisão anterior — ela vai para o
           -- histórico de versões (order_versions), não se perde.
           approval_status = case when v_approval = 'recusado' then 'rascunho' else approval_status end,
           submitted_at = case when v_approval = 'recusado' then null else submitted_at end,
           submitted_by = case when v_approval = 'recusado' then null else submitted_by end,
           approved_at = case when v_approval = 'recusado' then null else approved_at end,
           approved_by = case when v_approval = 'recusado' then null else approved_by end,
           approval_notes = case when v_approval = 'recusado' then null else approval_notes end
     where id = v_order_id and tenant_id = v_tenant_id;

    delete from public.order_items where order_id = v_order_id;
  end if;

  insert into public.order_items (tenant_id, order_id, product_id, kit_id, quantity, unit_price,
                                  ad_hoc_kit_signature, ad_hoc_kit_composition,
                                  ad_hoc_kit_packaging, ad_hoc_kit_label)
  select v_tenant_id, v_order_id, x.product_id, x.kit_id, x.quantity, x.unit_price,
         x.ad_hoc_kit_signature, x.ad_hoc_kit_composition, x.ad_hoc_kit_packaging, x.ad_hoc_kit_label
    from jsonb_to_recordset(p_items) as x(
      product_id uuid, kit_id uuid, quantity numeric, unit_price numeric,
      ad_hoc_kit_signature text, ad_hoc_kit_composition jsonb,
      ad_hoc_kit_packaging jsonb, ad_hoc_kit_label text
    );

  if (select count(*) from public.order_items where order_id = v_order_id)
       <> jsonb_array_length(p_items) then
    raise exception 'Nem todos os itens da cotação foram persistidos';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.order_versions where order_id = v_order_id;

  insert into public.order_versions (tenant_id, order_id, version, snapshot, created_by)
  values (v_tenant_id, v_order_id, v_version, coalesce(p_snapshot, '{}'::jsonb), auth.uid());

  return jsonb_build_object(
    'id', v_order_id,
    'version', v_version,
    'quote_number', (select quote_number from public.orders where id = v_order_id)
  );
end $$;

revoke execute on function public.save_quote_revision(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_quote_revision(uuid, jsonb, jsonb, jsonb) to authenticated;
