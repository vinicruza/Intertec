-- Vendedor externo pode ter comissão variável por pedido.
-- Comercial continua preso ao próprio vendedor; a exceção é somente para
-- pedidos do canal/seller Externos.

create or replace function public.assert_vendedor_do_proprio_acesso()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.current_user_role();
  v_meu_vendedor uuid;
  v_default_commission numeric;
  v_channel_name text;
  v_seller_channel_name text;
  v_comissao_variavel boolean;
begin
  if v_role is distinct from 'comercial' then
    return new;
  end if;

  if new.seller_id is null or new.channel_id is null then
    raise exception 'Não foi possível salvar o pedido. Procure um Administrador.';
  end if;

  v_meu_vendedor := public.meu_vendedor();

  if v_meu_vendedor is null then
    raise exception 'Não foi possível salvar o pedido. Procure um Administrador.';
  end if;

  if new.seller_id is distinct from v_meu_vendedor then
    raise exception 'Não foi possível salvar o pedido. Procure um Administrador.';
  end if;

  select c.default_commission_rate, c.name
    into v_default_commission, v_channel_name
    from public.channels c
   where c.id = new.channel_id
     and c.tenant_id = new.tenant_id;

  select c.name
    into v_seller_channel_name
    from public.sellers s
    join public.channels c on c.id = s.channel_id and c.tenant_id = s.tenant_id
   where s.id = new.seller_id
     and s.tenant_id = new.tenant_id;

  if v_default_commission is null then
    raise exception 'Não foi possível salvar o pedido. Procure um Administrador.';
  end if;

  v_comissao_variavel :=
    lower(coalesce(v_channel_name, '')) like '%extern%'
    or lower(coalesce(v_seller_channel_name, '')) like '%extern%';

  if v_comissao_variavel then
    if new.commission_rate is null or new.commission_rate < 0 or new.commission_rate >= 1 then
      raise exception 'Comissão inválida.';
    end if;
    return new;
  end if;

  if new.commission_rate is null or abs(new.commission_rate - v_default_commission) > 0.000000001 then
    raise exception 'Não foi possível salvar o pedido. Procure um Administrador.';
  end if;

  return new;
end $$;

revoke execute on function public.assert_vendedor_do_proprio_acesso() from public, anon, authenticated;
