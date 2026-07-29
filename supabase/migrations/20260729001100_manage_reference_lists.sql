-- Escrita das listas de referência pela tela de Cadastros.
--
-- As listas de tipo de cliente, área de atuação e motivo de perda nasceram
-- como partida sugerida — a Intertech ainda não fechou nenhuma delas. Sem uma
-- tela, ajustar exigiria mexer no banco à mão, e a decisão ficaria travada.
--
-- As políticas de RLS já permitem escrita a admin e financeiro; estas funções
-- adicionam as validações que a tabela sozinha não expressa (prefixo em uso,
-- lista em uso por registro existente).

-- ------------------------------------------------------------------
-- Tipo de cliente e área de atuação
-- ------------------------------------------------------------------
create or replace function public.save_customer_segment(
  p_tabela text,          -- 'tipo' ou 'area'
  p_id uuid,              -- nulo = criar
  p_name text,
  p_code_prefix text,
  p_sort_order integer,
  p_active boolean
)
returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_id uuid := p_id;
begin
  if not public.has_role('admin','financeiro') then
    raise exception 'Sem permissão para alterar as listas';
  end if;
  if p_tabela not in ('tipo', 'area') then
    raise exception 'Lista inválida';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Informe o nome';
  end if;
  if p_code_prefix !~ '^[0-9]{2}$' then
    raise exception 'O prefixo precisa ter exatamente dois dígitos (ex.: 10)';
  end if;

  if p_tabela = 'tipo' then
    if v_id is null then
      insert into public.customer_types (tenant_id, name, code_prefix, sort_order, active)
      values (v_tenant_id, btrim(p_name), p_code_prefix, coalesce(p_sort_order, 0), coalesce(p_active, true))
      returning id into v_id;
    else
      -- O prefixo NÃO muda depois de criado: ele está dentro do código dos
      -- clientes já categorizados, e mudá-lo faria o código mentir sobre o
      -- segmento sem reescrever nada.
      update public.customer_types
         set name = btrim(p_name), sort_order = coalesce(p_sort_order, 0), active = coalesce(p_active, true)
       where id = v_id and tenant_id = v_tenant_id;
      if not found then raise exception 'Tipo de cliente não encontrado'; end if;
    end if;
  else
    if v_id is null then
      insert into public.customer_specialties (tenant_id, name, code_prefix, sort_order, active)
      values (v_tenant_id, btrim(p_name), p_code_prefix, coalesce(p_sort_order, 0), coalesce(p_active, true))
      returning id into v_id;
    else
      update public.customer_specialties
         set name = btrim(p_name), sort_order = coalesce(p_sort_order, 0), active = coalesce(p_active, true)
       where id = v_id and tenant_id = v_tenant_id;
      if not found then raise exception 'Área de atuação não encontrada'; end if;
    end if;
  end if;

  return v_id;
end $$;

-- Remoção só quando ninguém usa: apagar um segmento em uso deixaria clientes
-- apontando para o vazio e o código deles sem significado.
create or replace function public.delete_customer_segment(p_tabela text, p_id uuid)
returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_tenant_id uuid := public.current_tenant_id(); v_em_uso integer;
begin
  if not public.has_role('admin','financeiro') then
    raise exception 'Sem permissão para alterar as listas';
  end if;

  if p_tabela = 'tipo' then
    select count(*) into v_em_uso from public.customers
     where tenant_id = v_tenant_id and customer_type_id = p_id;
    if v_em_uso > 0 then
      raise exception 'Este tipo está em uso por % cliente(s). Desative em vez de excluir.', v_em_uso;
    end if;
    delete from public.customer_types where id = p_id and tenant_id = v_tenant_id;
  elsif p_tabela = 'area' then
    select count(*) into v_em_uso from public.customers
     where tenant_id = v_tenant_id and customer_specialty_id = p_id;
    if v_em_uso > 0 then
      raise exception 'Esta área está em uso por % cliente(s). Desative em vez de excluir.', v_em_uso;
    end if;
    delete from public.customer_specialties where id = p_id and tenant_id = v_tenant_id;
  else
    raise exception 'Lista inválida';
  end if;
end $$;

-- ------------------------------------------------------------------
-- Motivos de perda
-- ------------------------------------------------------------------
create or replace function public.save_loss_reason(
  p_id uuid,
  p_label text,
  p_sort_order integer,
  p_active boolean
)
returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_tenant_id uuid := public.current_tenant_id(); v_id uuid := p_id;
begin
  if not public.has_role('admin','financeiro') then
    raise exception 'Sem permissão para alterar os motivos de perda';
  end if;
  if nullif(btrim(p_label), '') is null then
    raise exception 'Informe o motivo';
  end if;

  if v_id is null then
    insert into public.loss_reasons (tenant_id, label, sort_order, active)
    values (v_tenant_id, btrim(p_label), coalesce(p_sort_order, 0), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.loss_reasons
       set label = btrim(p_label), sort_order = coalesce(p_sort_order, 0), active = coalesce(p_active, true)
     where id = v_id and tenant_id = v_tenant_id;
    if not found then raise exception 'Motivo não encontrado'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.delete_loss_reason(p_id uuid)
returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_tenant_id uuid := public.current_tenant_id(); v_em_uso integer;
begin
  if not public.has_role('admin','financeiro') then
    raise exception 'Sem permissão para alterar os motivos de perda';
  end if;
  select count(*) into v_em_uso from public.orders
   where tenant_id = v_tenant_id and loss_reason_id = p_id;
  if v_em_uso > 0 then
    raise exception 'Este motivo já foi usado em % cotação(ões). Desative em vez de excluir.', v_em_uso;
  end if;
  delete from public.loss_reasons where id = p_id and tenant_id = v_tenant_id;
end $$;

-- ------------------------------------------------------------------
-- Prefixo numérico das categorias de produto (usado no código de ERP)
-- ------------------------------------------------------------------
create or replace function public.save_category_erp_prefix(p_id uuid, p_erp_prefix text)
returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_role('admin') then
    raise exception 'Apenas o Administrador altera o prefixo de ERP';
  end if;
  if p_erp_prefix is not null and p_erp_prefix !~ '^[0-9]{1,4}$' then
    raise exception 'O prefixo precisa ter de 1 a 4 dígitos';
  end if;
  if exists (select 1 from public.products p
              join public.product_categories c on c.id = p.category_id
             where c.id = p_id and p.erp_code is not null) then
    raise exception 'Esta categoria já tem produtos com código de ERP gerado; mudar o prefixo quebraria a referência no ERP.';
  end if;

  update public.product_categories
     set erp_prefix = nullif(btrim(p_erp_prefix), '')
   where id = p_id and tenant_id = v_tenant_id;
  if not found then raise exception 'Categoria não encontrada'; end if;
end $$;

revoke execute on function public.save_customer_segment(text, uuid, text, text, integer, boolean) from public, anon;
revoke execute on function public.delete_customer_segment(text, uuid) from public, anon;
revoke execute on function public.save_loss_reason(uuid, text, integer, boolean) from public, anon;
revoke execute on function public.delete_loss_reason(uuid) from public, anon;
revoke execute on function public.save_category_erp_prefix(uuid, text) from public, anon;
grant execute on function public.save_customer_segment(text, uuid, text, text, integer, boolean) to authenticated;
grant execute on function public.delete_customer_segment(text, uuid) to authenticated;
grant execute on function public.save_loss_reason(uuid, text, integer, boolean) to authenticated;
grant execute on function public.delete_loss_reason(uuid) to authenticated;
grant execute on function public.save_category_erp_prefix(uuid, text) to authenticated;
