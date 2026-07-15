alter table public.orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id),
  add column if not exists cancellation_reason text;

create index if not exists orders_cancelled_at_idx on public.orders(cancelled_at);

create or replace function public.protect_closed_order()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if tg_op='DELETE' then
    if old.status='closed' or old.cancelled_at is not null then
      raise exception 'Pedido fechado ou cancelado não pode ser excluído';
    end if;
    return old;
  end if;

  if old.cancelled_at is not null then
    raise exception 'Pedido cancelado é imutável';
  end if;

  if new.cancelled_at is not null then
    if (to_jsonb(new)-'cancelled_at'-'cancelled_by'-'cancellation_reason'-'updated_at')
       <> (to_jsonb(old)-'cancelled_at'-'cancelled_by'-'cancellation_reason'-'updated_at') then
      raise exception 'Cancelamento não pode alterar os dados financeiros do pedido';
    end if;
    insert into public.audit_logs(tenant_id,entity,entity_id,action,old_value,new_value,user_id)
    values(old.tenant_id,'orders',old.id,'cancel',
      jsonb_build_object('status',old.status),
      jsonb_build_object('cancelled_at',new.cancelled_at,'reason',new.cancellation_reason),auth.uid());
    return new;
  end if;

  if old.status='closed' then
    raise exception 'Pedido fechado é imutável; crie uma revisão vinculada ao original';
  end if;
  return new;
end $$;

create or replace function public.protect_closed_order_items()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_order_id uuid;
begin
  v_order_id:=coalesce(new.order_id,old.order_id);
  if exists(select 1 from public.orders o where o.id=v_order_id and (o.status='closed' or o.cancelled_at is not null)) then
    raise exception 'Itens de pedido fechado ou cancelado são imutáveis';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.cancel_order(p_order_id uuid,p_reason text)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_order public.orders%rowtype; v_role public.user_role:=public.current_user_role();
begin
  if nullif(btrim(p_reason),'') is null or length(btrim(p_reason))<5 then
    raise exception 'Informe um motivo de cancelamento com ao menos 5 caracteres';
  end if;
  select * into v_order from public.orders
   where id=p_order_id and tenant_id=public.current_tenant_id() for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.cancelled_at is not null then raise exception 'Pedido já está cancelado'; end if;
  if v_order.status='closed' and v_role<>'admin' then raise exception 'Somente Administrador cancela pedido fechado'; end if;
  if v_order.status='simulation' and v_role not in ('admin','comercial') then raise exception 'Sem permissão para cancelar simulação'; end if;
  update public.orders set cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=btrim(p_reason),updated_at=now()
   where id=p_order_id;
end $$;

revoke execute on function public.cancel_order(uuid,text) from public,anon;
grant execute on function public.cancel_order(uuid,text) to authenticated;
revoke execute on function public.protect_closed_order() from public,anon,authenticated;
revoke execute on function public.protect_closed_order_items() from public,anon,authenticated;
