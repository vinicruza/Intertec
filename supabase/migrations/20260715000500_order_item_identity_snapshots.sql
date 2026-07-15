alter table public.order_items
  add column if not exists item_name_snapshot text,
  add column if not exists item_category_snapshot text;

create or replace function public.snapshot_order_item_identity()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  if new.cmv_unit_snapshot is not null and old.cmv_unit_snapshot is null then
    if new.product_id is not null then
      select p.name,coalesce(nullif(btrim(p.category),''),'Sem categoria')
        into new.item_name_snapshot,new.item_category_snapshot
        from public.products p where p.id=new.product_id and p.tenant_id=new.tenant_id;
    else
      select '[Kit] '||k.name,'Kit'
        into new.item_name_snapshot,new.item_category_snapshot
        from public.kits k where k.id=new.kit_id and k.tenant_id=new.tenant_id;
    end if;
    if new.item_name_snapshot is null then raise exception 'Não foi possível congelar a identidade do item'; end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_snapshot_order_item_identity on public.order_items;
create trigger trg_snapshot_order_item_identity
before update of cmv_unit_snapshot on public.order_items
for each row execute function public.snapshot_order_item_identity();

-- Migração dos pedidos já fechados. A identidade passa a ficar congelada a
-- partir deste ponto; apenas esta carga inicial consulta o cadastro vigente.
update public.order_items oi set
  item_name_snapshot=case when oi.product_id is not null
    then (select p.name from public.products p where p.id=oi.product_id)
    else (select '[Kit] '||k.name from public.kits k where k.id=oi.kit_id) end,
  item_category_snapshot=case when oi.product_id is not null
    then (select coalesce(nullif(btrim(p.category),''),'Sem categoria') from public.products p where p.id=oi.product_id)
    else 'Kit' end
from public.orders o
where o.id=oi.order_id and o.status='closed' and oi.cmv_unit_snapshot is not null
  and oi.item_name_snapshot is null;

revoke execute on function public.snapshot_order_item_identity() from public,anon,authenticated;
