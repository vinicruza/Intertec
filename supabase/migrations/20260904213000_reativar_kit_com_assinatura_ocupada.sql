-- Reativar kit cuja composição já foi tomada por outro (04/09/2026, mais tarde).
--
-- Escrevi `set_kit_status` acreditando que a assinatura de um kit inativo
-- continuava reservada — era assim desde 07/2026, com o índice único
-- `kits_tenant_id_signature_key` valendo para qualquer status. Conferindo o
-- banco depois de aplicar, não é mais: em 04/09/2026, às 17h04, o índice virou
-- PARCIAL (`kits_active_signature_unique ... where status = 'active'`), e junto
-- veio um `save_kit_with_items` que só procura duplicata entre kits ativos.
--
-- Isso cria um caminho que termina em erro cru na tela:
--
--   1. o kit A (composição X) é inativado;
--   2. alguém monta a composição X de novo — e agora ganha um kit B, novo,
--      com código novo, porque o índice não olha mais o kit A inativo;
--   3. alguém reativa o kit A → o índice recusa, porque A e B seriam dois
--      ativos com a mesma assinatura. A pessoa recebe "duplicate key value
--      violates unique constraint", em inglês, sem saber o que fazer.
--
-- O passo 3 passa a ser barrado antes, com uma frase que diz qual kit está
-- ocupando a composição e qual é a saída.
create or replace function public.set_kit_status(
  p_kit_id uuid,
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
  v_ocupante record;
  v_novo entity_status := case when p_ativo then 'active' else 'inactive' end::entity_status;
  v_abertos bigint;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem tenant ativo';
  end if;
  if v_papel is null or v_papel not in ('admin', 'financeiro') then
    raise exception 'Somente Administrador e Financeiro podem ativar ou inativar um kit do catálogo';
  end if;

  select id, code, name, status, signature into v_atual
    from public.kits
   where id = p_kit_id and tenant_id = v_tenant_id;
  if not found then
    raise exception 'Kit não encontrado';
  end if;

  -- Quantos orçamentos em aberto usam este kit. Vai no retorno e na auditoria:
  -- é o efeito colateral da inativação, e fica registrado o tamanho dele no
  -- momento em que a decisão foi tomada.
  select count(distinct oi.order_id) into v_abertos
    from public.order_items oi
    join public.orders o on o.id = oi.order_id and o.tenant_id = oi.tenant_id
   where oi.kit_id = p_kit_id
     and oi.tenant_id = v_tenant_id
     and o.status = 'simulation'
     and o.cancelled_at is null;

  if v_atual.status = v_novo then
    return jsonb_build_object(
      'tipo', 'sem_mudanca',
      'status', v_novo,
      'orcamentos_em_aberto', v_abertos
    );
  end if;

  -- Reativação: a composição pode ter sido ocupada por um kit criado enquanto
  -- este estava fora. Explicar é melhor do que deixar o índice recusar em
  -- inglês — e a saída existe, é o kit que está ativo hoje.
  if p_ativo and v_atual.signature is not null then
    select id, code, name into v_ocupante
      from public.kits
     where tenant_id = v_tenant_id
       and signature = v_atual.signature
       and status = 'active'
       and id <> p_kit_id
     limit 1;
    if found then
      raise exception
        'Não dá para reativar o kit %: a mesma composição já é do kit % (%), que está ativo. Use esse kit, ou inative-o antes de reativar este.',
        coalesce(v_atual.code, v_atual.name),
        coalesce(v_ocupante.code, '(sem código)'),
        v_ocupante.name;
    end if;
  end if;

  update public.kits
     set status = v_novo,
         updated_at = now()
   where id = p_kit_id and tenant_id = v_tenant_id;
  if not found then
    raise exception 'Kit não encontrado';
  end if;

  insert into public.audit_logs (tenant_id, entity, entity_id, action, old_value, new_value, user_id)
  values (
    v_tenant_id,
    'kits',
    p_kit_id,
    case when p_ativo then 'activate' else 'deactivate' end,
    jsonb_build_object('status', v_atual.status),
    jsonb_build_object(
      'status', v_novo,
      'code', v_atual.code,
      'name', v_atual.name,
      'motivo', nullif(btrim(p_motivo), ''),
      'orcamentos_em_aberto', v_abertos
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'tipo', 'alterado',
    'status', v_novo,
    'orcamentos_em_aberto', v_abertos
  );
end $$;

revoke execute on function public.set_kit_status(uuid, boolean, text) from public, anon;
grant execute on function public.set_kit_status(uuid, boolean, text) to authenticated;
