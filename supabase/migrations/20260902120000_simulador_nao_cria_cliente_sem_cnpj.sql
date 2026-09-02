-- ============================================================
-- O simulador deixa de criar cliente sem CNPJ
-- Pedido da Intertech em 02/09/2026.
-- ============================================================
--
-- A Santa Casa de Igarapava apareceu duas vezes na base: um cadastro veio do
-- ERP sem CNPJ e, trinta minutos depois, alguem criou outro com o nome digitado
-- errado ("IAGARAPAVA"). Procurar pelo nome certo nao encontrava o errado, e a
-- Patricia nao conseguia completar o CNPJ do registro bom porque o documento ja
-- estava no duplicado.
--
-- O formulario de cliente passou a exigir os campos de identidade. Mas havia
-- uma segunda porta, e era a mais larga: ao cotar, o simulador cria um cliente
-- com NOME e UF apenas. Sem documento, nada impede o mesmo cliente de nascer de
-- novo — a unica defesa vira o nome.
--
-- Agora o CNPJ vem junto, e o banco faz o que a tela nao tem como fazer: se ja
-- existe cliente com aquele documento, a cotacao usa o EXISTENTE em vez de
-- criar um repetido. Reaproveitar e melhor do que recusar: quem esta cotando
-- nao queria cadastrar nada, queria vender.

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
  v_approval_notes text;
  v_auto_approved boolean := false;
  v_carrier_id uuid := nullif(p_order->>'carrier_id', '')::uuid;
  v_carrier_other text := nullif(btrim(p_order->>'carrier_other'), '');
  v_weight_kg numeric := nullif(p_order->>'weight_kg', '')::numeric;
  v_volumes integer := nullif(p_order->>'volumes', '')::integer;
  v_volumes_composition text := nullif(btrim(p_order->>'volumes_composition'), '');
  v_shipping_zip text := nullif(regexp_replace(coalesce(p_order->>'shipping_zip', ''), '\D', '', 'g'), '');
  v_payment_term_id uuid := nullif(p_order->>'payment_term_id', '')::uuid;
  v_payment_term integer := nullif(p_order->>'payment_term_days', '')::integer;
  v_order_notes text := nullif(btrim(p_order->>'order_notes'), '');
  v_applies_difal boolean;
  -- Só dígitos: a tela manda formatado, e o banco guarda limpo.
  v_customer_tax_id text := nullif(regexp_replace(coalesce(p_order->>'customer_tax_id',''), '[^0-9]', '', 'g'), '');
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cotação sem itens';
  end if;

  if v_payment_term_id is not null and not exists (
    select 1 from public.payment_terms
     where id = v_payment_term_id and tenant_id = v_tenant_id and active
  ) then
    raise exception 'Modo de pagamento inválido';
  end if;

  v_customer_id := nullif(p_order->>'customer_id', '')::uuid;
  if v_customer_id is null and nullif(btrim(p_order->>'customer_name'), '') is not null then
    -- Antes de criar, procura quem JA tem este CNPJ. Era por aqui que o mesmo
    -- cliente entrava duas vezes: o simulador criava cadastro so com nome, e
    -- nome se digita errado — foi assim que a Santa Casa de Igarapava virou
    -- "IAGARAPAVA" num segundo registro (02/09/2026).
    if v_customer_tax_id is not null then
      select id into v_customer_id from public.customers
       where tenant_id = v_tenant_id and tax_id = v_customer_tax_id;
    end if;

    if v_customer_id is null then
      insert into public.customers (tenant_id, name, uf, tax_id)
      values (v_tenant_id, btrim(p_order->>'customer_name'), p_order->>'uf', v_customer_tax_id)
      returning id into v_customer_id;
    end if;
  end if;

  v_applies_difal := coalesce(
    (p_order->>'applies_difal')::boolean,
    (select applies_difal from public.channels where id = (p_order->>'channel_id')::uuid),
    true
  );

  if v_order_id is null then
    insert into public.orders (tenant_id, status, customer_id, uf, seller_id, channel_id,
                               freight, freight_paid_by_customer, commission_rate, applies_difal, created_by,
                               carrier_id, carrier_other, weight_kg, volumes, volumes_composition, shipping_zip,
                               payment_term_id, payment_term_days, order_notes)
    values (v_tenant_id, 'simulation', v_customer_id, p_order->>'uf',
            (p_order->>'seller_id')::uuid, (p_order->>'channel_id')::uuid,
            (p_order->>'freight')::numeric, (p_order->>'freight_paid_by_customer')::boolean,
            (p_order->>'commission_rate')::numeric, v_applies_difal, auth.uid(),
            v_carrier_id, v_carrier_other, v_weight_kg, v_volumes, v_volumes_composition, v_shipping_zip,
            v_payment_term_id, v_payment_term, v_order_notes)
    returning id into v_order_id;
  else
    select status, approval_status, approval_notes
      into v_status, v_approval, v_approval_notes
      from public.orders
     where id = v_order_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Cotação não encontrada'; end if;
    v_auto_approved := v_approval = 'aprovado' and coalesce(v_approval_notes, '') ilike 'Aprovado automaticamente pela margem%';

    if v_status <> 'simulation' then
      raise exception 'Só é possível editar cotação em aberto; esta já foi ganha ou perdida';
    end if;
    if v_approval = 'pendente' then
      raise exception 'Cotação aguardando aprovação não pode ser editada; aguarde a decisão';
    end if;
    if v_approval = 'aprovado' and not v_auto_approved then
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
           volumes_composition = v_volumes_composition,
           shipping_zip = v_shipping_zip,
           payment_term_id = v_payment_term_id,
           payment_term_days = v_payment_term,
           order_notes = v_order_notes,
           approval_status = case when v_approval = 'recusado' or v_auto_approved then 'rascunho'::approval_status else approval_status end,
           submitted_at = case when v_approval = 'recusado' or v_auto_approved then null else submitted_at end,
           submitted_by = case when v_approval = 'recusado' or v_auto_approved then null else submitted_by end,
           approved_at = case when v_approval = 'recusado' or v_auto_approved then null else approved_at end,
           approved_by = case when v_approval = 'recusado' or v_auto_approved then null else approved_by end,
           approval_notes = case when v_approval = 'recusado' or v_auto_approved then null else approval_notes end
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
    'quote_number', (select quote_number from public.orders where id = v_order_id),
    'order_number', (select order_number from public.orders where id = v_order_id)
  );
end $$;
