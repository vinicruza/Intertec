-- Devolve ao `save_kit_with_items` o que a reescrita de 04/09 deixou cair.
--
-- A migração 20260904170514 (aplicada direto no banco às 17h05) reescreveu a
-- função inteira para procurar duplicata só entre kits ATIVOS. O objetivo era
-- legítimo e fica de pé. No caminho, porém, caíram três coisas que a versão de
-- 20260806000100 tinha de propósito — e os testes de `regras-do-banco` acusaram
-- as três no instante em que a migração órfã entrou no repositório. É para isso
-- que eles existem: "uma migração nova reescrever uma função e deixar cair uma
-- cláusula".
--
-- 1. A TRAVA DA COMPOSIÇÃO DE KIT GANHO. Kit nascido de pedido fechado tem o
--    código no papel, na nota e na fábrica, e o sistema inteiro é construído
--    sobre "um código, uma composição". Sem a trava, mudar a composição pela
--    tela de Kits faz o código deixar de valer para quem já o recebeu e muda,
--    por baixo, o custo de cotações em aberto que usam aquele kit. Nome e
--    descrição seguem editáveis, como sempre foram.
--
-- 2. O CÓDIGO NO AVISO DE DUPLICATA. O payload voltou a ser só id e nome, e
--    "nome de kit não identifica nada" — a tela precisa do código para dizer
--    qual kit usar. Volta também o `status`, que `KitFormPage` lê para avisar
--    quando o kit repetido está inativo.
--
-- 3. OS ACENTOS DAS MENSAGENS. "Nome do kit e obrigatorio" volta a ser "é
--    obrigatório": é texto que chega à tela da vendedora.
--
-- O que a versão de 17h05 trouxe e CONTINUA valendo: duplicata procurada só
-- entre ativos (par do índice parcial `kits_active_signature_unique`) e a
-- recusa de kit como componente de outro kit.

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

  -- Kit dentro de kit: recusado (guarda de 04/09/2026).
  if exists (
    select 1
      from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric)
     where x.product_id is null
        or public.is_product_classified_as_kit(x.product_id, v_tenant_id)
  ) then
    raise exception 'Não é permitido adicionar um kit como componente de outro kit';
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

  -- Duplicata só entre ATIVOS: é o par do índice parcial de 04/09/2026.
  select id, name, code, status into v_existing
    from public.kits
   where tenant_id = v_tenant_id
     and signature = p_signature
     and status = 'active'
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
     where tenant_id = v_tenant_id and signature = p_signature and status = 'active'
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
    raise;
end $$;

revoke execute on function public.save_kit_with_items(uuid,text,text,text,text,jsonb,jsonb) from public, anon;
grant execute on function public.save_kit_with_items(uuid,text,text,text,text,jsonb,jsonb) to authenticated;
