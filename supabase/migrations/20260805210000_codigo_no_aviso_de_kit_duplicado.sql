-- O aviso de kit duplicado precisa dizer QUAL É O CÓDIGO.
--
-- Regra do produto (PRD §6.5): ao salvar um kit cuja composição já existe, o
-- sistema oferece reutilizar o kit existente em vez de duplicar. O aviso já
-- existia, mas devolvia só o id e o NOME do kit — e nome de kit não identifica
-- nada para quem trabalha com o catálogo: dois kits podem ter nomes parecidos
-- ("Kit catarata", "Kit catarata Hospital X") e é o código (KC0001) que vai no
-- pedido, na nota e na conversa com a fábrica.
--
-- No simulador o aviso já mostra o código, porque lá ele é montado no
-- aplicativo a partir do catálogo carregado. Só a gravação pelo banco ficava
-- sem — ou seja, quem edita um kit pela tela de Kits recebia um aviso pela
-- metade. Esta migração fecha essa diferença: o mesmo aviso, com o mesmo dado,
-- pelos dois caminhos.
--
-- Nada mais muda no corpo da função: é a mesma versão de 20260729001300, com
-- `code` acrescentado nas duas saídas de duplicidade.

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
        -- O kit gêmeo pode estar inativo: quem recebe o aviso precisa saber,
        -- senão fica procurando um código que não aparece na lista.
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

  -- O código do kit é gerado pelo gatilho trg_kits_auto_code (KC + sequência).
  -- Devolvê-lo aqui evita que a tela precise de uma segunda consulta só para
  -- mostrar à pessoa o código que acabou de nascer.
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
