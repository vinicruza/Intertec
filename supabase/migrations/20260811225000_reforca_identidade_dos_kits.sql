-- Reforço do fluxo de kits (Intertech, 11/08/2026).
--
-- A tela já bloqueia kit sem nome/composição, mas a garantia precisa ficar no
-- banco também: ao Gerar Pedido, kit montado na cotação não pode virar "Kit do
-- pedido" genérico. Se a composição for inédita, ela ganha código KC; se já
-- existir, reaproveita o código existente.

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
  v_codigo text;
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

    if nullif(btrim(v_item.ad_hoc_kit_label), '') is null then
      raise exception 'Kit montado precisa de nome antes de Gerar Pedido';
    end if;

    if jsonb_typeof(v_item.ad_hoc_kit_composition) <> 'array'
       or jsonb_array_length(v_item.ad_hoc_kit_composition) = 0 then
      raise exception 'Kit montado precisa ter ao menos um produto antes de Gerar Pedido';
    end if;

    select id into v_kit_id from public.kits
     where tenant_id = v_tenant_id and signature = v_item.ad_hoc_kit_signature;
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

    -- O código é gerado pelo gatilho na inserção; só depois ele existe para ler.
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
end $$;

revoke execute on function public.materialize_ad_hoc_kits(uuid) from public, anon;
grant execute on function public.materialize_ad_hoc_kits(uuid) to authenticated;
