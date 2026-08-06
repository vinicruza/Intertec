-- Duas coisas que faltavam no ciclo do kit que nasce de um pedido.
--
-- 1. QUAL CÓDIGO NASCEU
--
-- Ao ganhar o pedido, o sistema cria os kits montados na hora e gera os
-- códigos oficiais — e não conta isso a ninguém. A informação existe (a função
-- já sabe quantos criou) e era descartada. Quem fechou o pedido tinha de ir
-- procurar na tela de Kits para descobrir o código do que acabou de nascer.
-- A função passa a devolver a lista: código, nome e se aquele kit nasceu agora
-- ou já existia (composição repetida reaproveita o código, por decisão da
-- reunião de 16/07/2026).
--
-- 2. COMPOSIÇÃO DE KIT GANHO NÃO MUDA MAIS
--
-- A composição de qualquer kit era editável pela tela de Kits, e o código
-- continuava o mesmo. Duas consequências ruins:
--
--   - uma cotação em aberto que usa aquele kit passa a valer outro custo, sem
--     ninguém ser avisado;
--   - o código que alguém anotou no papel deixa de corresponder à composição
--     que essa pessoa viu — e o sistema inteiro é construído sobre "um código,
--     uma composição".
--
-- Pedido fechado não é afetado (guarda o custo congelado, Decisão D7), mas o
-- catálogo passa a mentir sobre o passado.
--
-- A trava vale só para kit que NASCEU DE PEDIDO GANHO (source_order_id
-- preenchido): esse já circulou em papel e em nota. Kit cadastrado à mão
-- continua totalmente editável. Nome e descrição seguem editáveis nos dois
-- casos — o que trava é a composição, que é o que o código promete.
--
-- Montar um kit diferente é barato: monta-se no simulador, ganha código novo,
-- e a assinatura única impede duplicidade.

-- ------------------------------------------------------------------
-- 1. Gravação do kit: composição de kit ganho é imutável
-- ------------------------------------------------------------------
create or replace function public.save_kit_with_items(
  p_kit_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_signature text,
  p_items jsonb,
  p_packaging jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_kit_id uuid := p_kit_id;
  v_existing record;
  v_atual record;
  v_packaging jsonb := coalesce(p_packaging, '[]'::jsonb);
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Nome do kit é obrigatório';
  end if;
  if nullif(btrim(p_signature), '') is null then
    raise exception 'Assinatura do kit é obrigatória';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Kit deve possuir ao menos um item';
  end if;
  if jsonb_typeof(v_packaging) <> 'array' then
    raise exception 'Embalagem do kit deve ser uma lista';
  end if;

  -- Kit que nasceu de pedido ganho: o código já circulou. Composição trava.
  if p_kit_id is not null then
    select signature, source_order_id, code into v_atual
      from public.kits where id = p_kit_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Kit não encontrado'; end if;
    if v_atual.source_order_id is not null and v_atual.signature is distinct from p_signature then
      raise exception 'O kit % nasceu de um pedido ganho: a composição dele não pode mudar, senão o código deixa de valer para quem já o recebeu. Monte um kit novo no simulador — ele ganha código próprio. Nome e descrição continuam editáveis.', v_atual.code;
    end if;
  end if;

  select id, name, code, status into v_existing
    from public.kits
   where tenant_id = v_tenant_id
     and signature = p_signature
     and (p_kit_id is null or id <> p_kit_id)
   limit 1;
  if found then
    return jsonb_build_object(
      'tipo', 'duplicado',
      'kitExistente', jsonb_build_object(
        'id', v_existing.id,
        'name', v_existing.name,
        'code', v_existing.code,
        'status', v_existing.status
      )
    );
  end if;

  if v_kit_id is null then
    insert into public.kits (tenant_id, code, name, description, signature)
    values (v_tenant_id, nullif(btrim(p_code), ''), btrim(p_name),
            nullif(btrim(p_description), ''), p_signature)
    returning id into v_kit_id;
  else
    update public.kits
       set code = coalesce(nullif(btrim(p_code), ''), code),
           name = btrim(p_name),
           description = nullif(btrim(p_description), ''),
           signature = p_signature
     where id = v_kit_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Kit não encontrado'; end if;
    delete from public.kit_items where kit_id = v_kit_id;
    delete from public.kit_packaging where kit_id = v_kit_id;
  end if;

  insert into public.kit_items (tenant_id, kit_id, product_id, quantity)
  select v_tenant_id, v_kit_id, x.product_id, x.quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric);

  if (select count(*) from public.kit_items where kit_id = v_kit_id)
       <> jsonb_array_length(p_items) then
    raise exception 'Nem todos os itens do kit foram persistidos';
  end if;

  if jsonb_array_length(v_packaging) > 0 then
    insert into public.kit_packaging (tenant_id, kit_id, input_id, quantity_type, quantity, lot_size)
    select v_tenant_id, v_kit_id, x.input_id,
           coalesce(nullif(btrim(x.quantity_type), ''), 'direct'),
           x.quantity, x.lot_size
      from jsonb_to_recordset(v_packaging)
           as x(input_id uuid, quantity_type text, quantity numeric, lot_size numeric);

    if (select count(*) from public.kit_packaging where kit_id = v_kit_id)
         <> jsonb_array_length(v_packaging) then
      raise exception 'Nem todos os itens de embalagem do kit foram persistidos';
    end if;
  end if;

  return jsonb_build_object(
    'tipo', case when p_kit_id is null then 'criado' else 'atualizado' end,
    'id', v_kit_id,
    'code', (select code from public.kits where id = v_kit_id)
  );
exception
  when unique_violation then
    select id, name, code, status into v_existing
      from public.kits
     where tenant_id = v_tenant_id and signature = p_signature
     limit 1;
    if found then
      return jsonb_build_object('tipo', 'duplicado',
        'kitExistente', jsonb_build_object(
          'id', v_existing.id,
          'name', v_existing.name,
          'code', v_existing.code,
          'status', v_existing.status
        ));
    end if;
    raise;
end;
$$;

revoke execute on function public.save_kit_with_items(uuid,text,text,text,text,jsonb,jsonb) from public, anon;
grant execute on function public.save_kit_with_items(uuid,text,text,text,text,jsonb,jsonb) to authenticated;

-- ------------------------------------------------------------------
-- 2. Materialização devolve QUAIS kits, não só quantos
-- ------------------------------------------------------------------
-- O tipo de retorno muda (integer → jsonb), então a função precisa cair antes.
drop function if exists public.materialize_ad_hoc_kits(uuid);

create or replace function public.materialize_ad_hoc_kits(p_order_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_item record;
  v_kit_id uuid;
  v_nome text;
  v_novo boolean;
  v_kits jsonb := '[]'::jsonb;
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
    v_novo := not found;

    if v_novo then
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
    end if;

    -- O código é gerado pelo gatilho na inserção; só depois ele existe para ler.
    v_kits := v_kits || jsonb_build_array(jsonb_build_object(
      'id', v_kit_id,
      'code', (select code from public.kits where id = v_kit_id),
      'name', (select name from public.kits where id = v_kit_id),
      'novo', v_novo
    ));

    update public.order_items
       set kit_id = v_kit_id,
           ad_hoc_kit_signature = null,
           ad_hoc_kit_composition = null,
           ad_hoc_kit_packaging = null,
           ad_hoc_kit_label = null
     where id = v_item.id;
  end loop;

  return v_kits;
end $$;

revoke execute on function public.materialize_ad_hoc_kits(uuid) from public, anon;
grant execute on function public.materialize_ad_hoc_kits(uuid) to authenticated;
