-- Comercial lança pedido em nome próprio, sem vínculo manual (06/08/2026)
--
-- Regra vigente:
--   • Perfil Comercial pode lançar pedido.
--   • Comercial lança somente em nome próprio.
--   • Apenas Administrador pode lançar pedido em nome de outro vendedor.
--
-- O pedido continua usando orders.seller_id porque canal, comissão, frete e
-- DIFAL vêm do cadastro de vendedores. A diferença é que o "meu vendedor" não
-- é mais uma associação configurada na tela de Usuários: é o vendedor ativo
-- com o mesmo nome do perfil logado, dentro do mesmo tenant.

drop function if exists public.vincular_vendedor(uuid, uuid);
drop index if exists public.sellers_profile_id_unico;

alter table public.sellers
  drop column if exists profile_id;

create or replace function public.meu_vendedor()
returns uuid
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select s.id
    from public.sellers s
    join public.profiles p
      on p.id = auth.uid()
     and p.active
     and p.tenant_id = s.tenant_id
   where s.tenant_id = public.current_tenant_id()
     and s.active
     and lower(btrim(s.name)) = lower(btrim(p.full_name))
   limit 1;
$$;

revoke execute on function public.meu_vendedor() from public, anon;
grant execute on function public.meu_vendedor() to authenticated;

create or replace function public.assert_vendedor_do_proprio_acesso()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.current_user_role();
  v_meu_vendedor uuid;
begin
  -- Administrador lança por qualquer vendedor. Os demais perfis não chegam
  -- aqui: não têm permissão de gravar pedido (RLS orders_insert/update).
  if v_role is distinct from 'comercial' then
    return new;
  end if;

  if new.seller_id is null then
    raise exception 'Escolha o vendedor do pedido.';
  end if;

  v_meu_vendedor := public.meu_vendedor();

  if v_meu_vendedor is null then
    raise exception 'O seu perfil Comercial não encontrou um vendedor ativo com o mesmo nome do seu acesso. Peça para um Administrador conferir o seu nome ou o cadastro de vendedores.';
  end if;

  if new.seller_id is distinct from v_meu_vendedor then
    raise exception 'Comercial só pode lançar pedido em nome próprio. Apenas Administrador pode lançar pedido em nome de outro vendedor.';
  end if;

  return new;
end $$;

revoke execute on function public.assert_vendedor_do_proprio_acesso() from public, anon, authenticated;

drop trigger if exists trg_orders_vendedor_do_acesso on public.orders;
create trigger trg_orders_vendedor_do_acesso
before insert or update of seller_id on public.orders
for each row execute function public.assert_vendedor_do_proprio_acesso();

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
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp, auth as $$
begin
  if not public.has_role('admin') then
    raise exception 'Apenas o Administrador vê a lista de usuários';
  end if;

  return query
    select p.id, p.full_name, p.role::text, p.active, p.is_super_admin, p.is_super_admin,
           u.email::text, u.last_sign_in_at, p.created_at
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.tenant_id = public.current_tenant_id()
       and (not p.is_super_admin or public.current_user_is_super_admin())
     order by p.active desc, p.full_name;
end $$;

revoke execute on function public.list_users_for_admin() from public, anon;
grant execute on function public.list_users_for_admin() to authenticated;
