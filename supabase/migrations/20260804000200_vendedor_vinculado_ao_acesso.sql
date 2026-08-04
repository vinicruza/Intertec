-- Vendedor vinculado ao acesso (decisão do cliente, 04/08/2026)
--
-- Até aqui "vendedor" e "quem entra no sistema" eram dois cadastros sem
-- nenhuma ligação: qualquer Comercial via os 12 vendedores na lista e podia
-- lançar pedido no nome de qualquer um deles. Havia rastro (orders.created_by
-- guarda quem de fato criou), mas rastro é para auditar depois, não para
-- impedir na hora.
--
-- Regra decidida:
--   • Comercial só lança pedido para o vendedor vinculado ao seu acesso.
--   • Administrador lança para qualquer vendedor.
--   • Comercial continua ENXERGANDO todos os pedidos e todos os vendedores —
--     a lista de pedidos mostra o nome do vendedor de cada linha.

-- ------------------------------------------------------------------
-- 1. A ligação
-- ------------------------------------------------------------------
alter table public.sellers
  add column if not exists profile_id uuid references public.profiles (id);

comment on column public.sellers.profile_id is
  'Acesso ao sistema que representa este vendedor. Nulo = vendedor sem login (histórico, ou quem não usa o sistema).';

-- Um acesso representa no máximo um vendedor. Sem isto, vincular a mesma
-- pessoa a dois vendedores tornaria "o vendedor dele" ambíguo justamente na
-- hora de decidir se o pedido pode ser lançado.
create unique index if not exists sellers_profile_id_unico
  on public.sellers (profile_id) where profile_id is not null;

-- ------------------------------------------------------------------
-- 2. A trava, no banco
-- ------------------------------------------------------------------
-- Gatilho, e não política de RLS, porque a política enxerga só a linha nova:
-- não daria para distinguir "está lançando um pedido" de "está editando um
-- pedido que já era de outro vendedor". Com OLD e NEW à mão, a regra fica
-- exata — barra criar ou transferir para outro vendedor, e deixa passar a
-- edição de um pedido cujo vendedor não mudou.
create or replace function public.assert_vendedor_do_proprio_acesso()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.current_user_role();
begin
  -- Administrador lança por qualquer vendedor. Os demais perfis não chegam
  -- aqui: não têm permissão de gravar pedido (RLS orders_insert).
  if v_role is distinct from 'comercial' then
    return new;
  end if;

  -- Editar um pedido sem trocar o vendedor continua liberado.
  if tg_op = 'UPDATE' and new.seller_id is not distinct from old.seller_id then
    return new;
  end if;

  if new.seller_id is null then
    raise exception 'Escolha o vendedor do pedido.';
  end if;

  if not exists (
    select 1 from public.sellers s
     where s.id = new.seller_id
       and s.profile_id = auth.uid()
       and s.tenant_id = new.tenant_id
  ) then
    raise exception 'Você só pode lançar pedido para o vendedor vinculado ao seu acesso. Se o seu acesso ainda não tem vendedor vinculado, peça ao Administrador para fazer isso na tela de Usuários.';
  end if;

  return new;
end $$;

revoke execute on function public.assert_vendedor_do_proprio_acesso() from public, anon, authenticated;

drop trigger if exists trg_orders_vendedor_do_acesso on public.orders;
create trigger trg_orders_vendedor_do_acesso
before insert or update of seller_id on public.orders
for each row execute function public.assert_vendedor_do_proprio_acesso();

-- ------------------------------------------------------------------
-- 3. Quem é o vendedor de quem está usando o sistema
-- ------------------------------------------------------------------
-- A tela precisa saber, para mostrar só o vendedor certo na lista em vez de
-- deixar a pessoa escolher errado e tomar o erro do gatilho só ao salvar.
create or replace function public.meu_vendedor()
returns uuid
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select s.id from public.sellers s
   where s.profile_id = auth.uid()
     and s.tenant_id = public.current_tenant_id()
   limit 1;
$$;

revoke execute on function public.meu_vendedor() from public, anon;
grant execute on function public.meu_vendedor() to authenticated;

-- ------------------------------------------------------------------
-- 4. Vincular e desvincular — só o Administrador
-- ------------------------------------------------------------------
create or replace function public.vincular_vendedor(p_profile_id uuid, p_seller_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := public.current_tenant_id();
begin
  if not public.has_role('admin') then
    raise exception 'Apenas o Administrador vincula vendedor a um acesso';
  end if;

  -- Não deixa mexer no dono do sistema pela porta de trás.
  perform public.assert_can_manage_user(p_profile_id, 'update');

  -- Um acesso por vez: solta o vínculo anterior antes de criar o novo.
  update public.sellers
     set profile_id = null, updated_at = now()
   where profile_id = p_profile_id and tenant_id = v_tenant;

  if p_seller_id is not null then
    update public.sellers
       set profile_id = p_profile_id, updated_at = now()
     where id = p_seller_id and tenant_id = v_tenant;

    if not found then
      raise exception 'Vendedor não encontrado';
    end if;
  end if;

  insert into public.audit_logs (tenant_id, entity, entity_id, action, old_value, new_value, user_id)
  values (v_tenant, 'profiles', p_profile_id, 'update_access', null,
          jsonb_build_object('vendedor_vinculado', p_seller_id), auth.uid());
end $$;

revoke execute on function public.vincular_vendedor(uuid, uuid) from public, anon;
grant execute on function public.vincular_vendedor(uuid, uuid) to authenticated;

-- ------------------------------------------------------------------
-- 5. A lista de usuários passa a mostrar o vínculo
-- ------------------------------------------------------------------
drop function if exists public.list_users_for_admin();

create function public.list_users_for_admin()
returns table (
  id uuid,
  full_name text,
  role text,
  active boolean,
  is_super_admin boolean,
  is_superadmin boolean,
  email text,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  seller_id uuid,
  seller_name text
)
language plpgsql stable security definer set search_path = public, pg_temp, auth as $$
begin
  if not public.has_role('admin') then
    raise exception 'Apenas o Administrador vê a lista de usuários';
  end if;

  return query
    select p.id, p.full_name, p.role::text, p.active, p.is_super_admin, p.is_super_admin,
           u.email::text, u.last_sign_in_at, p.created_at,
           s.id, s.name
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.sellers s on s.profile_id = p.id and s.tenant_id = p.tenant_id
     where p.tenant_id = public.current_tenant_id()
       and (not p.is_super_admin or public.current_user_is_super_admin())
     order by p.active desc, p.full_name;
end $$;

revoke execute on function public.list_users_for_admin() from public, anon;
grant execute on function public.list_users_for_admin() to authenticated;
