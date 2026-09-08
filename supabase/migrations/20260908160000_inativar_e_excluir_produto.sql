-- Inativar, reativar e excluir produto pelo catálogo (Patricia, 08/09/2026).
--
-- "Vini, pode liberar no acesso de administrador o cancelamento ou exclusão de
-- produtos." A coluna `products.status` existe desde o primeiro dia e o
-- simulador já a respeita (`.eq("status","active")` na lista de itens
-- vendáveis), mas nunca houve onde clicar — a mesma história dos kits, resolvida
-- em 04/09.
--
-- São duas portas diferentes, e a diferença importa:
--
--   INATIVAR   tira o produto de circulação sem apagar nada. É reversível, e é
--              o que serve para "esse a gente não vende mais".
--   EXCLUIR    apaga a linha. Só é possível para produto que nunca foi usado
--              em lugar nenhum — pedido, kit, ficha de outro produto, venda
--              externa ou rateio de despesa. É para o cadastro digitado errado
--              que nasceu e nunca andou.
--
-- Sem a segunda porta, o cadastro só cresce. Sem a primeira, alguém tentaria
-- excluir o que não pode e levaria um erro de chave estrangeira em inglês.

-- ------------------------------------------------------------------
-- 1. Onde este produto é usado
-- ------------------------------------------------------------------
-- Uma consulta só, usada pelas duas portas: a de inativar (para avisar) e a de
-- excluir (para recusar). Assim as duas nunca discordam sobre o que é "usado".
create or replace function public.uso_do_produto(p_product_id uuid)
returns table (
  em_pedidos bigint,
  em_kits bigint,
  em_fichas bigint,
  em_vendas bigint,
  em_despesas bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*) from public.order_items oi
      where oi.product_id = p_product_id and oi.tenant_id = public.current_tenant_id()),
    (select count(*) from public.kit_items ki
      where ki.product_id = p_product_id and ki.tenant_id = public.current_tenant_id()),
    -- Componente da ficha de OUTRO produto. A ficha do próprio produto não
    -- conta: ela morre junto com ele (cascade), e é parte dele.
    (select count(*) from public.product_components pc
      where pc.component_product_id = p_product_id and pc.tenant_id = public.current_tenant_id()),
    (select count(*) from public.external_sales es
      where es.product_id = p_product_id and es.tenant_id = public.current_tenant_id()),
    (select count(*) from public.expense_allocations ea
      where ea.product_id = p_product_id and ea.tenant_id = public.current_tenant_id());
$$;

revoke execute on function public.uso_do_produto(uuid) from public, anon;
grant execute on function public.uso_do_produto(uuid) to authenticated;

-- ------------------------------------------------------------------
-- 2. Inativar / reativar
-- ------------------------------------------------------------------
-- Administrador e Financeiro, que é quem já pode escrever em `products`
-- (política `products_write`) e é a mesma régua do kit. Registrado em
-- `audit_logs` com o `auth.uid()` de quem clicou — por isso SECURITY INVOKER.
create or replace function public.set_product_status(
  p_product_id uuid,
  p_ativo boolean,
  p_motivo text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_papel text := public.current_user_role();
  v_atual record;
  v_novo entity_status := case when p_ativo then 'active' else 'inactive' end::entity_status;
  v_uso record;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;
  if v_papel is null or v_papel not in ('admin', 'financeiro') then
    raise exception 'Somente Administrador e Financeiro podem ativar ou inativar um produto do catálogo';
  end if;

  select id, code, name, status into v_atual
    from public.products
   where id = p_product_id and tenant_id = v_tenant_id;
  if not found then
    raise exception 'Produto não encontrado';
  end if;

  select * into v_uso from public.uso_do_produto(p_product_id);

  if v_atual.status = v_novo then
    return jsonb_build_object('tipo', 'sem_mudanca', 'status', v_novo,
      'em_kits', v_uso.em_kits, 'em_fichas', v_uso.em_fichas);
  end if;

  update public.products
     set status = v_novo,
         updated_at = now()
   where id = p_product_id and tenant_id = v_tenant_id;
  if not found then
    raise exception 'Produto não encontrado';
  end if;

  insert into public.audit_logs (tenant_id, entity, entity_id, action, old_value, new_value, user_id)
  values (
    v_tenant_id, 'products', p_product_id,
    case when p_ativo then 'activate' else 'deactivate' end,
    jsonb_build_object('status', v_atual.status),
    jsonb_build_object(
      'status', v_novo,
      'code', v_atual.code,
      'name', v_atual.name,
      'motivo', nullif(btrim(p_motivo), ''),
      'em_kits', v_uso.em_kits,
      'em_fichas', v_uso.em_fichas
    ),
    auth.uid()
  );

  return jsonb_build_object('tipo', 'alterado', 'status', v_novo,
    'em_kits', v_uso.em_kits, 'em_fichas', v_uso.em_fichas);
end $$;

revoke execute on function public.set_product_status(uuid, boolean, text) from public, anon;
grant execute on function public.set_product_status(uuid, boolean, text) to authenticated;

-- ------------------------------------------------------------------
-- 3. Excluir — só o que nunca andou
-- ------------------------------------------------------------------
-- SOMENTE Administrador: apagar é a única operação deste sistema que não tem
-- volta, e o Financeiro não precisa dela para fazer o trabalho dele.
--
-- A recusa vem ANTES do banco recusar: as chaves estrangeiras já barrariam,
-- mas com "violates foreign key constraint" em inglês, sem dizer ONDE o
-- produto está sendo usado nem o que fazer. Aqui a frase diz os dois — e
-- aponta a saída, que é inativar.
create or replace function public.delete_product(p_product_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_papel text := public.current_user_role();
  v_atual record;
  v_uso record;
  v_onde text[] := '{}';
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;
  if v_papel is null or v_papel <> 'admin' then
    raise exception 'Somente o Administrador pode excluir um produto';
  end if;

  select id, code, name, status into v_atual
    from public.products
   where id = p_product_id and tenant_id = v_tenant_id;
  if not found then
    raise exception 'Produto não encontrado';
  end if;

  select * into v_uso from public.uso_do_produto(p_product_id);

  if v_uso.em_pedidos  > 0 then v_onde := v_onde || format('%s pedido(s)', v_uso.em_pedidos); end if;
  if v_uso.em_kits     > 0 then v_onde := v_onde || format('%s kit(s)', v_uso.em_kits); end if;
  if v_uso.em_fichas   > 0 then v_onde := v_onde || format('a ficha de %s outro(s) produto(s)', v_uso.em_fichas); end if;
  if v_uso.em_vendas   > 0 then v_onde := v_onde || format('%s venda(s) importada(s)', v_uso.em_vendas); end if;
  if v_uso.em_despesas > 0 then v_onde := v_onde || format('%s rateio(s) de despesa', v_uso.em_despesas); end if;

  if array_length(v_onde, 1) > 0 then
    raise exception
      'O produto % não pode ser excluído: ele está em %. Excluir apagaria o passado — inative-o, que ele some da lista de venda e o histórico continua de pé.',
      coalesce(v_atual.code, v_atual.name),
      array_to_string(v_onde, ', ');
  end if;

  -- A auditoria vai ANTES do delete: depois dele não há mais linha para
  -- descrever, e é justamente esta operação que mais precisa ficar registrada.
  insert into public.audit_logs (tenant_id, entity, entity_id, action, old_value, new_value, user_id)
  values (
    v_tenant_id, 'products', p_product_id, 'delete',
    jsonb_build_object('code', v_atual.code, 'name', v_atual.name, 'status', v_atual.status),
    null,
    auth.uid()
  );

  -- Ficha própria e custo caem junto (cascade); nada mais aponta para ele.
  delete from public.products where id = p_product_id and tenant_id = v_tenant_id;

  return jsonb_build_object('tipo', 'excluido', 'code', v_atual.code, 'name', v_atual.name);
end $$;

revoke execute on function public.delete_product(uuid) from public, anon;
grant execute on function public.delete_product(uuid) to authenticated;
