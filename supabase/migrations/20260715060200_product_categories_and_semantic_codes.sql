-- Categorias institucionais e códigos semânticos, preservando UUIDs e códigos legados.
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  name text not null,
  slug text not null,
  prefix text not null check (prefix ~ '^[A-Z]{2}$'),
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (tenant_id, name),
  unique (tenant_id, slug),
  unique (tenant_id, prefix)
);

alter table public.product_categories enable row level security;
create policy product_categories_select on public.product_categories for select
  using (tenant_id=public.current_tenant_id() and public.current_user_role() is not null);
create policy product_categories_write on public.product_categories for all
  using (tenant_id=public.current_tenant_id() and public.current_user_role() in ('admin','financeiro'))
  with check (tenant_id=public.current_tenant_id() and public.current_user_role() in ('admin','financeiro'));
grant select,insert,update,delete on public.product_categories to authenticated;

insert into public.product_categories(tenant_id,name,slug,prefix,description,sort_order)
select t.id,v.name,v.slug,v.prefix,v.description,v.sort_order
from public.tenants t cross join (values
  ('Paramentação Cirúrgica','paramentacao-cirurgica','PC','Vestuário e proteção utilizados pela equipe cirúrgica',10),
  ('Acessórios Cirúrgicos','acessorios-cirurgicos','AC','Acessórios e itens complementares do procedimento',20),
  ('Campos Cirúrgicos','campos-cirurgicos','CC','Campos, coberturas e barreiras para o campo operatório',30),
  ('Kits Cirúrgicos','kits-cirurgicos','KC','Conjuntos e kits de produtos cirúrgicos',40)
) as v(name,slug,prefix,description,sort_order)
on conflict (tenant_id,prefix) do update set name=excluded.name,slug=excluded.slug,
  description=excluded.description,sort_order=excluded.sort_order,active=true;

alter table public.products add column category_id uuid references public.product_categories(id),
  add column legacy_code text;
alter table public.kits add column legacy_code text;

update public.products set legacy_code=code where legacy_code is null;
update public.kits set legacy_code=code where legacy_code is null;

update public.products p set category_id=c.id, category=c.name
from public.product_categories c
where c.tenant_id=p.tenant_id and c.prefix=case
  when lower(p.name) ~ '^kit( |$)' then 'KC'
  when lower(p.name) ~ '^(campo|steri drape)( |$)' then 'CC'
  when lower(p.name) ~ '^(avental|conjunto|bota|perneira|touca|máscara|mascara|propé|prope|capote|manguito)( |$)' then 'PC'
  else 'AC' end;

drop trigger if exists trg_products_auto_code on public.products;
drop trigger if exists trg_kits_auto_code on public.kits;

with numbered as (
  select p.id,c.prefix,row_number() over(partition by p.tenant_id,c.prefix order by
    coalesce(nullif(regexp_replace(p.legacy_code,'\D','','g'),''),'0')::integer,p.created_at,p.id) as n
  from public.products p join public.product_categories c on c.id=p.category_id
)
update public.products p set code=n.prefix||'-'||lpad(n.n::text,4,'0') from numbered n where n.id=p.id;

with base as (
  select tenant_id,count(*) as n from public.products where code like 'KC-%' group by tenant_id
), numbered as (
  select k.id,row_number() over(partition by k.tenant_id order by k.created_at,k.id)+coalesce(b.n,0) as n
  from public.kits k left join base b on b.tenant_id=k.tenant_id
)
update public.kits k set code='KC-'||lpad(n.n::text,4,'0') from numbered n where n.id=k.id;

alter table public.products alter column category_id set not null, alter column category set not null;
alter table public.products add constraint products_semantic_code check(code ~ '^(PC|AC|CC|KC)-[0-9]{4,}$');
alter table public.kits add constraint kits_semantic_code check(code ~ '^KC-[0-9]{4,}$');
create unique index products_legacy_code_unique on public.products(tenant_id,legacy_code) where legacy_code is not null;
create unique index kits_legacy_code_unique on public.kits(tenant_id,legacy_code) where legacy_code is not null;
create index products_category_id_idx on public.products(category_id);

create table public.catalog_code_history(
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  entity_type text not null check(entity_type in ('product','kit')), entity_id uuid not null,
  old_code text, new_code text not null, reason text not null, changed_at timestamptz not null default now(),
  unique(entity_type,entity_id,new_code)
);
alter table public.catalog_code_history enable row level security;
create policy catalog_code_history_select on public.catalog_code_history for select
  using(tenant_id=public.current_tenant_id() and public.current_user_role() is not null);
grant select on public.catalog_code_history to authenticated;
insert into public.catalog_code_history(tenant_id,entity_type,entity_id,old_code,new_code,reason)
select tenant_id,'product',id,legacy_code,code,'Migração para código semântico por categoria' from public.products
union all select tenant_id,'kit',id,legacy_code,code,'Migração para código semântico por categoria' from public.kits;

create or replace function public.next_category_code(p_tenant_id uuid,p_prefix text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_next integer;
begin
  perform pg_advisory_xact_lock(hashtext('catalog:'||p_tenant_id::text||':'||p_prefix));
  select greatest(
    coalesce((select max(substring(code from '[0-9]+$')::integer) from public.products where tenant_id=p_tenant_id and code like p_prefix||'-%'),0),
    coalesce((select max(substring(code from '[0-9]+$')::integer) from public.kits where tenant_id=p_tenant_id and code like p_prefix||'-%'),0)
  )+1 into v_next;
  return p_prefix||'-'||lpad(v_next::text,4,'0');
end $$;

create or replace function public.set_product_code()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prefix text; v_name text;
begin
  select prefix,name into v_prefix,v_name from public.product_categories
    where id=new.category_id and tenant_id=new.tenant_id and active;
  if v_prefix is null then raise exception 'Categoria de produto inválida ou inativa'; end if;
  new.category:=v_name;
  if tg_op='INSERT' then
    if new.legacy_code is null and nullif(btrim(new.code),'') is not null then new.legacy_code:=upper(btrim(new.code)); end if;
    new.code:=public.next_category_code(new.tenant_id,v_prefix);
  elsif new.code is distinct from old.code then raise exception 'Código de catálogo é imutável';
  end if;
  return new;
end $$;

create or replace function public.set_kit_code()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    if new.legacy_code is null and nullif(btrim(new.code),'') is not null then new.legacy_code:=upper(btrim(new.code)); end if;
    new.code:=public.next_category_code(new.tenant_id,'KC');
  elsif new.code is distinct from old.code then raise exception 'Código de catálogo é imutável';
  end if;
  return new;
end $$;

create trigger trg_products_auto_code before insert or update of category_id,code on public.products
for each row execute function public.set_product_code();
create trigger trg_kits_auto_code before insert or update of code on public.kits
for each row execute function public.set_kit_code();

create or replace function public.save_product_with_components(p_product_id uuid,p_product jsonb,p_components jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_tenant_id uuid:=public.current_tenant_id(); v_product_id uuid:=p_product_id; v_category_id uuid;
begin
  if jsonb_typeof(p_components)<>'array' or jsonb_array_length(p_components)=0 then raise exception 'Produto deve possuir ao menos um componente'; end if;
  begin v_category_id:=(p_product->>'category_id')::uuid; exception when others then raise exception 'Categoria é obrigatória'; end;
  if not exists(select 1 from public.product_categories where id=v_category_id and tenant_id=v_tenant_id and active) then raise exception 'Categoria inválida ou inativa'; end if;
  if v_product_id is null then
    insert into public.products(tenant_id,code,name,category_id,type,sterile,size,grammage)
    values(v_tenant_id,null,btrim(p_product->>'name'),v_category_id,nullif(btrim(p_product->>'type'),''),
      coalesce((p_product->>'sterile')::boolean,false),nullif(btrim(p_product->>'size'),''),nullif(btrim(p_product->>'grammage'),'')) returning id into v_product_id;
  else
    update public.products set name=btrim(p_product->>'name'),category_id=v_category_id,
      type=nullif(btrim(p_product->>'type'),''),sterile=coalesce((p_product->>'sterile')::boolean,false),
      size=nullif(btrim(p_product->>'size'),''),grammage=nullif(btrim(p_product->>'grammage'),'')
    where id=v_product_id and tenant_id=v_tenant_id;
    if not found then raise exception 'Produto não encontrado'; end if;
    delete from public.product_components where product_id=v_product_id;
  end if;
  insert into public.product_components(tenant_id,product_id,component_input_id,component_product_id,quantity_type,quantity,width,length,yield_rate,lot_size,computed_quantity)
  select v_tenant_id,v_product_id,x.component_input_id,x.component_product_id,x.quantity_type::public.quantity_type,x.quantity,x.width,x.length,x.yield_rate,x.lot_size,x.computed_quantity
  from jsonb_to_recordset(p_components) x(component_input_id uuid,component_product_id uuid,quantity_type text,quantity numeric,width numeric,length numeric,yield_rate numeric,lot_size numeric,computed_quantity numeric);
  perform public.recalculate_product_costs(); return v_product_id;
end $$;

alter table public.order_items add column item_code_snapshot text;
create or replace function public.snapshot_order_item_identity()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.cmv_unit_snapshot is not null and old.cmv_unit_snapshot is null then
    if new.product_id is not null then
      select p.code,p.name,p.category into new.item_code_snapshot,new.item_name_snapshot,new.item_category_snapshot
      from public.products p where p.id=new.product_id and p.tenant_id=new.tenant_id;
    else
      select k.code,'[Kit] '||k.name,'Kits Cirúrgicos' into new.item_code_snapshot,new.item_name_snapshot,new.item_category_snapshot
      from public.kits k where k.id=new.kit_id and k.tenant_id=new.tenant_id;
    end if;
    if new.item_name_snapshot is null then raise exception 'Não foi possível congelar a identidade do item'; end if;
  end if; return new;
end $$;
update public.order_items oi set item_code_snapshot=case when product_id is not null then (select code from public.products where id=oi.product_id) else (select code from public.kits where id=oi.kit_id) end where item_code_snapshot is null;

revoke execute on function public.next_category_code(uuid,text) from public,anon,authenticated;
revoke execute on function public.set_product_code() from public,anon,authenticated;
revoke execute on function public.set_kit_code() from public,anon,authenticated;
revoke execute on function public.snapshot_order_item_identity() from public,anon,authenticated;
revoke execute on function public.save_product_with_components(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_product_with_components(uuid,jsonb,jsonb) to authenticated;
