-- Oculta detalhes internos da regra comercial nas mensagens de erro (06/08/2026)

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
  if v_role is distinct from 'comercial' then
    return new;
  end if;

  if new.seller_id is null then
    raise exception 'Não foi possível salvar o pedido. Procure um Administrador.';
  end if;

  v_meu_vendedor := public.meu_vendedor();

  if v_meu_vendedor is null then
    raise exception 'Não foi possível salvar o pedido. Procure um Administrador.';
  end if;

  if new.seller_id is distinct from v_meu_vendedor then
    raise exception 'Não foi possível salvar o pedido. Procure um Administrador.';
  end if;

  select s.channel_id, c.default_commission_rate
    into v_channel_id, v_default_commission
    from public.sellers s
    join public.channels c on c.id = s.channel_id
   where s.id = v_meu_vendedor
     and s.tenant_id = new.tenant_id
     and s.active;

  if v_channel_id is null then
    raise exception 'Não foi possível salvar o pedido. Procure um Administrador.';
  end if;

  if new.channel_id is distinct from v_channel_id then
    raise exception 'Não foi possível salvar o pedido. Procure um Administrador.';
  end if;

  if new.commission_rate is null or abs(new.commission_rate - v_default_commission) > 0.000000001 then
    raise exception 'Não foi possível salvar o pedido. Procure um Administrador.';
  end if;

  return new;
end $$;

revoke execute on function public.assert_vendedor_do_proprio_acesso() from public, anon, authenticated;
