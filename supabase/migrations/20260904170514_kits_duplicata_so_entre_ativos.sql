-- REGISTRO DE MIGRAÇÃO APLICADA DIRETO NO BANCO (04/09/2026, 17h05).
-- Transcrita de `supabase_migrations.schema_migrations`, sem alteração.
--
-- Acompanha o índice parcial da migração anterior: a procura por composição
-- repetida passa a olhar só kits ATIVOS, nos dois caminhos (salvar pela tela
-- de Kits e materializar o kit montado dentro do pedido).
--
-- ---- DUAS PERDAS QUE ESTA VERSÃO TROUXE, REGISTRADAS AQUI ----
--
-- Esta função foi reescrita por inteiro, e no caminho caíram duas coisas que
-- existiam na versão de 20260806000100. Ficam anotadas porque não parecem
-- intencionais, e a decisão de restaurá-las é da Intertech:
--
-- 1. A TRAVA DA COMPOSIÇÃO DE KIT GANHO. A versão anterior recusava mudar a
--    composição de um kit nascido de pedido fechado ("o código já foi para o
--    papel, para a nota e para a fábrica"). Esta não recusa mais. O teste em
--    tests/pedidos/regras-do-banco.test.ts continua exigindo a regra do
--    ARQUIVO, então o repositório e o banco discordam neste ponto.
--
-- 2. O `status` NO AVISO DE DUPLICATA. O payload 'duplicado' perdeu o campo
--    `status`, que a tela lê (`KitFormPage`, "(kit inativo no catálogo)").
--    Sem ele o aviso nunca diz que o kit repetido está inativo — com o índice
--    parcial isso é raro, porque a busca já ignora inativos, mas o campo
--    continua no tipo do TypeScript.

create or replace function public.save_kit_with_items(p_kit_id uuid, p_code text, p_name text, p_description text, p_signature text, p_items jsonb, p_packaging jsonb DEFAULT '[]'::jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_kit_id uuid := p_kit_id;
  v_existing record;
  v_packaging jsonb := coalesce(p_packaging, '[]'::jsonb);
begin
  if v_tenant_id is null then raise exception 'Usuario sem tenant ativo'; end if;
  if nullif(btrim(p_name), '') is null then raise exception 'Nome do kit e obrigatorio'; end if;
  if nullif(btrim(p_signature), '') is null then raise exception 'Assinatura do kit e obrigatoria'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Kit deve possuir ao menos um item';
  end if;
  if jsonb_typeof(v_packaging) <> 'array' then raise exception 'Embalagem do kit deve ser uma lista'; end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric)
     where x.product_id is null
        or public.is_product_classified_as_kit(x.product_id, v_tenant_id)
  ) then
    raise exception 'Nao e permitido adicionar um kit como componente de outro kit';
  end if;

  select id, name into v_existing from public.kits
   where tenant_id = v_tenant_id and signature = p_signature and status = 'active'
     and (p_kit_id is null or id <> p_kit_id) limit 1;
  if found then
    return jsonb_build_object('tipo', 'duplicado',
      'kitExistente', jsonb_build_object('id', v_existing.id, 'name', v_existing.name));
  end if;

  if v_kit_id is null then
    insert into public.kits (tenant_id, code, name, description, signature)
    values (v_tenant_id, nullif(btrim(p_code), ''), btrim(p_name), nullif(btrim(p_description), ''), p_signature)
    returning id into v_kit_id;
  else
    update public.kits
       set code = coalesce(nullif(btrim(p_code), ''), code), name = btrim(p_name),
           description = nullif(btrim(p_description), ''), signature = p_signature
     where id = v_kit_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Kit nao encontrado'; end if;
    delete from public.kit_items where kit_id = v_kit_id;
    delete from public.kit_packaging where kit_id = v_kit_id;
  end if;

  insert into public.kit_items (tenant_id, kit_id, product_id, quantity)
  select v_tenant_id, v_kit_id, x.product_id, x.quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric);

  if (select count(*) from public.kit_items where kit_id = v_kit_id) <> jsonb_array_length(p_items) then
    raise exception 'Nem todos os itens do kit foram persistidos';
  end if;

  if jsonb_array_length(v_packaging) > 0 then
    insert into public.kit_packaging (tenant_id, kit_id, input_id, quantity_type, quantity, lot_size)
    select v_tenant_id, v_kit_id, x.input_id,
           coalesce(nullif(btrim(x.quantity_type), ''), 'direct'), x.quantity, x.lot_size
      from jsonb_to_recordset(v_packaging)
           as x(input_id uuid, quantity_type text, quantity numeric, lot_size numeric);

    if (select count(*) from public.kit_packaging where kit_id = v_kit_id) <> jsonb_array_length(v_packaging) then
      raise exception 'Nem todos os itens de embalagem do kit foram persistidos';
    end if;
  end if;

  return jsonb_build_object('tipo', case when p_kit_id is null then 'criado' else 'atualizado' end, 'id', v_kit_id);
exception
  when unique_violation then
    select id, name into v_existing from public.kits
     where tenant_id = v_tenant_id and signature = p_signature and status = 'active' limit 1;
    if found then
      return jsonb_build_object('tipo', 'duplicado',
        'kitExistente', jsonb_build_object('id', v_existing.id, 'name', v_existing.name));
    end if;
    raise;
end
$$;

create or replace function public.materialize_ad_hoc_kits(p_order_id uuid)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_item record;
  v_kit_id uuid;
  v_nome text;
  v_codigo text;
  v_novo boolean;
  v_kits jsonb := '[]'::jsonb;
begin
  if v_tenant_id is null then
    raise exception 'Usuario sem tenant ativo';
  end if;

  for v_item in
    select id, ad_hoc_kit_signature, ad_hoc_kit_composition, ad_hoc_kit_packaging, ad_hoc_kit_label
      from public.order_items
     where order_id = p_order_id and tenant_id = v_tenant_id
       and ad_hoc_kit_composition is not null
  loop
    if nullif(btrim(v_item.ad_hoc_kit_signature), '') is null then
      raise exception 'Kit montado sem assinatura - nao e possivel materializar';
    end if;

    if nullif(btrim(v_item.ad_hoc_kit_label), '') is null then
      raise exception 'Kit montado precisa de nome antes de Gerar Pedido';
    end if;

    if jsonb_typeof(v_item.ad_hoc_kit_composition) <> 'array'
       or jsonb_array_length(v_item.ad_hoc_kit_composition) = 0 then
      raise exception 'Kit montado precisa ter ao menos um produto antes de Gerar Pedido';
    end if;

    if exists (
      select 1
        from jsonb_to_recordset(v_item.ad_hoc_kit_composition) as x(product_id uuid, quantity numeric)
       where x.product_id is null
          or public.is_product_classified_as_kit(x.product_id, v_tenant_id)
    ) then
      raise exception 'Nao e permitido adicionar um kit como componente de outro kit';
    end if;

    select id into v_kit_id from public.kits
     where tenant_id = v_tenant_id and signature = v_item.ad_hoc_kit_signature and status = 'active';
    v_novo := not found;

    if v_novo then
      v_nome := btrim(v_item.ad_hoc_kit_label);
      insert into public.kits (tenant_id, name, description, signature, created_by, source_order_id)
      values (v_tenant_id, v_nome, null, v_item.ad_hoc_kit_signature, auth.uid(), p_order_id)
      returning id into v_kit_id;

      insert into public.kit_items (tenant_id, kit_id, product_id, quantity)
      select v_tenant_id, v_kit_id, x.product_id, x.quantity
        from jsonb_to_recordset(v_item.ad_hoc_kit_composition) as x(product_id uuid, quantity numeric);

      if (select count(*) from public.kit_items where kit_id = v_kit_id and tenant_id = v_tenant_id)
         <> jsonb_array_length(v_item.ad_hoc_kit_composition) then
        raise exception 'Nem todos os itens do kit foram persistidos';
      end if;

      if jsonb_typeof(v_item.ad_hoc_kit_packaging) = 'array'
         and jsonb_array_length(v_item.ad_hoc_kit_packaging) > 0 then
        insert into public.kit_packaging (tenant_id, kit_id, input_id, quantity_type, quantity, lot_size)
        select v_tenant_id, v_kit_id, x.input_id,
               coalesce(nullif(btrim(x.quantity_type), ''), 'direct'),
               x.quantity, x.lot_size
          from jsonb_to_recordset(v_item.ad_hoc_kit_packaging)
               as x(input_id uuid, quantity_type text, quantity numeric, lot_size numeric);

        if (select count(*) from public.kit_packaging where kit_id = v_kit_id and tenant_id = v_tenant_id)
           <> jsonb_array_length(v_item.ad_hoc_kit_packaging) then
          raise exception 'Nem todos os itens de embalagem do kit foram persistidos';
        end if;
      end if;
    end if;

    select code, name into v_codigo, v_nome
      from public.kits
     where id = v_kit_id and tenant_id = v_tenant_id;

    v_kits := v_kits || jsonb_build_array(jsonb_build_object(
      'id', v_kit_id,
      'code', v_codigo,
      'name', v_nome,
      'novo', v_novo
    ));

    update public.order_items
       set kit_id = v_kit_id,
           item_code_snapshot = coalesce(item_code_snapshot, v_codigo),
           item_name_snapshot = coalesce(item_name_snapshot, '[Kit] ' || v_nome),
           ad_hoc_kit_signature = null,
           ad_hoc_kit_composition = null,
           ad_hoc_kit_packaging = null,
           ad_hoc_kit_label = null
     where id = v_item.id;
  end loop;

  return v_kits;
end
$$;
