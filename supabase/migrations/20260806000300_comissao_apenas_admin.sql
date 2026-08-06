-- Comissão editável somente por Administrador (06/08/2026)
--
-- Regra temporária pedida pela operação:
--   • Administrador pode escolher vendedor e alterar comissão.
--   • Comercial lança só em nome próprio.
--   • Comercial não altera comissão; usa a comissão padrão do canal do seu vendedor.

create or replace function public.assert_vendedor_do_proprio_acesso()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.current_user_role();
  v_meu_vendedor uuid;
  v_channel_id uuid;
  v_default_commission numeric;
begin
  -- Administrador lança por qualquer vendedor e pode alterar comissão. Os
  -- demais perfis não chegam aqui: não têm permissão de gravar pedido.
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

  select s.channel_id, c.default_commission_rate
    into v_channel_id, v_default_commission
    from public.sellers s
    join public.channels c on c.id = s.channel_id
   where s.id = v_meu_vendedor
     and s.tenant_id = new.tenant_id
     and s.active;

  if v_channel_id is null then
    raise exception 'Não foi possível encontrar o canal do vendedor logado.';
  end if;

  if new.channel_id is distinct from v_channel_id then
    raise exception 'Comercial só pode lançar pedido no canal do próprio vendedor.';
  end if;

  if new.commission_rate is null or abs(new.commission_rate - v_default_commission) > 0.000000001 then
    raise exception 'Comissão só pode ser alterada por Administrador.';
  end if;

  return new;
end $$;

revoke execute on function public.assert_vendedor_do_proprio_acesso() from public, anon, authenticated;

drop trigger if exists trg_orders_vendedor_do_acesso on public.orders;
create trigger trg_orders_vendedor_do_acesso
before insert or update of seller_id, channel_id, commission_rate on public.orders
for each row execute function public.assert_vendedor_do_proprio_acesso();
