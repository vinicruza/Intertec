-- Correção: a caixa de esterilização do kit precisa ser RATEADA.
--
-- Vem de um retorno da Intertech em 29/07/2026, sobre como envelope e caixa
-- funcionam de verdade:
--
--   Nos PRODUTOS individuais, os dois já estão na ficha e são predeterminados
--   — o Campo Cirúrgico de Catarata tem a caixa como 1÷150, porque já se sabe
--   quantos cabem. "A caixa mais a esterilização é a mesma coisa, porque é o
--   número de caixas que vai esterilizar."
--
--   Nos KITS varia: "ele pode variar o envelope e pode variar a caixa — a
--   quantidade de itens por caixa". Um kit grande vai num envelope 40x55, dois
--   ou três campinhas vão num 10x15. Na hora de montar, a pessoa precisa
--   escolher qual envelope e quantos itens cabem por caixa.
--
-- O QUE ESTAVA ERRADO
--
-- A tabela guardava só "quantidade por kit". Serve para o envelope (um por
-- kit), mas não para a caixa: lançar "1 caixa" cobraria a caixa INTEIRA de
-- cada kit. Se cabem 10 kits nela, o custo saía dez vezes maior.
--
-- Nenhum kit tinha embalagem cadastrada ainda, então não há dado a converter.

alter table public.kit_packaging
  add column if not exists quantity_type text not null default 'direct',
  add column if not exists lot_size numeric,
  add column if not exists computed_quantity numeric;

-- No modo rateio a quantidade por kit não existe (o que existe é "itens por
-- caixa"), então a coluna precisa aceitar vazio. A coerência entre modo e
-- campos preenchidos passa a ser garantida pela constraint abaixo.
alter table public.kit_packaging alter column quantity drop not null;

alter table public.kit_packaging drop constraint if exists kit_packaging_quantity_type_check;
alter table public.kit_packaging add constraint kit_packaging_quantity_type_check
  check (quantity_type in ('direct', 'lot'));

-- Coerência entre o modo e os campos preenchidos, no mesmo padrão de
-- product_components: cada modo exige o seu número e proíbe o do outro.
alter table public.kit_packaging drop constraint if exists kit_packaging_quantity_shape;
alter table public.kit_packaging add constraint kit_packaging_quantity_shape
  check (
    (quantity_type = 'direct' and quantity is not null and quantity > 0 and lot_size is null)
    or (quantity_type = 'lot' and lot_size is not null and lot_size > 0)
  );

-- Preenche a quantidade efetiva das linhas existentes (nenhuma, hoje) e
-- garante que ela nunca fique nula daqui para a frente.
update public.kit_packaging
   set computed_quantity = case
         when quantity_type = 'lot' then 1 / lot_size
         else quantity
       end
 where computed_quantity is null;

comment on column public.kit_packaging.quantity_type is
  'direct = N unidades por kit (envelope). lot = 1 ÷ itens por caixa (caixa de '
  'esterilização, que atende vários kits).';
comment on column public.kit_packaging.lot_size is
  'Quantos itens cabem na caixa. Só no modo lot.';
comment on column public.kit_packaging.computed_quantity is
  'Quantidade efetivamente consumida por kit, já resolvida. Persistida para '
  'leitura; o motor é quem calcula.';

-- Deriva a quantidade efetiva no banco também, para nenhum caminho de escrita
-- conseguir gravar um valor incoerente com o modo escolhido.
create or replace function public.set_kit_packaging_quantity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.quantity_type = 'lot' then
    if new.lot_size is null or new.lot_size <= 0 then
      raise exception 'Informe quantos itens cabem na caixa';
    end if;
    new.quantity := null;
    new.computed_quantity := 1 / new.lot_size;
  else
    if new.quantity is null or new.quantity <= 0 then
      raise exception 'Informe a quantidade por kit';
    end if;
    new.lot_size := null;
    new.computed_quantity := new.quantity;
  end if;
  return new;
end $$;

drop trigger if exists trg_kit_packaging_quantity on public.kit_packaging;
create trigger trg_kit_packaging_quantity
  before insert or update on public.kit_packaging
  for each row execute function public.set_kit_packaging_quantity();

revoke execute on function public.set_kit_packaging_quantity() from public, anon, authenticated;

-- A gravação do kit passa a receber o modo de consumo de cada linha.
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

  select id, name into v_existing
    from public.kits
   where tenant_id = v_tenant_id
     and signature = p_signature
     and (p_kit_id is null or id <> p_kit_id)
   limit 1;
  if found then
    return jsonb_build_object(
      'tipo', 'duplicado',
      'kitExistente', jsonb_build_object('id', v_existing.id, 'name', v_existing.name)
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

  return jsonb_build_object('tipo', case when p_kit_id is null then 'criado' else 'atualizado' end,
                            'id', v_kit_id);
exception
  when unique_violation then
    select id, name into v_existing
      from public.kits
     where tenant_id = v_tenant_id and signature = p_signature
     limit 1;
    if found then
      return jsonb_build_object('tipo', 'duplicado',
        'kitExistente', jsonb_build_object('id', v_existing.id, 'name', v_existing.name));
    end if;
    raise;
end;
$$;

-- Materialização do kit ganho: repassa o modo de consumo junto.
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
      insert into public.kits (tenant_id, name, description, signature, created_by)
      values (v_tenant_id, v_nome, null, v_item.ad_hoc_kit_signature, auth.uid())
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
