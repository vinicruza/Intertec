-- Campo "Descrição NF" no cadastro de produto, pedido pelo cliente em
-- 30/07/2026: o texto que vai sair na nota fiscal quando o produto for
-- faturado. A emissão de NF em si continua fora do escopo da v1 (PRD §11,
-- "fora de escopo... integração com ERP/emissão de NF") — este campo só
-- GUARDA o texto, para não depender de decorar ou copiar de outro lugar na
-- hora de faturar. Mesma ideia do código de ERP (Sprint E): o sistema já
-- guarda o dado que o faturamento vai precisar, mesmo sem estar integrado.

alter table public.products
  add column if not exists nf_description text;

comment on column public.products.nf_description is
  'Descrição que sai na nota fiscal ao faturar este produto. Livre, sem '
  'validação de formato — quem decide o texto certo é a Intertech, não o '
  'sistema. Nulo até alguém preencher.';

-- Mesmo corpo de save_product_with_components (20260715060200), com a
-- descrição de NF a mais.
create or replace function public.save_product_with_components(p_product_id uuid,p_product jsonb,p_components jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_tenant_id uuid:=public.current_tenant_id(); v_product_id uuid:=p_product_id; v_category_id uuid;
begin
  if jsonb_typeof(p_components)<>'array' or jsonb_array_length(p_components)=0 then raise exception 'Produto deve possuir ao menos um componente'; end if;
  begin v_category_id:=(p_product->>'category_id')::uuid; exception when others then raise exception 'Categoria é obrigatória'; end;
  if not exists(select 1 from public.product_categories where id=v_category_id and tenant_id=v_tenant_id and active) then raise exception 'Categoria inválida ou inativa'; end if;
  if v_product_id is null then
    insert into public.products(tenant_id,code,name,category_id,type,sterile,size,grammage,nf_description)
    values(v_tenant_id,null,btrim(p_product->>'name'),v_category_id,nullif(btrim(p_product->>'type'),''),
      coalesce((p_product->>'sterile')::boolean,false),nullif(btrim(p_product->>'size'),''),nullif(btrim(p_product->>'grammage'),''),
      nullif(btrim(p_product->>'nf_description'),'')) returning id into v_product_id;
  else
    update public.products set name=btrim(p_product->>'name'),category_id=v_category_id,
      type=nullif(btrim(p_product->>'type'),''),sterile=coalesce((p_product->>'sterile')::boolean,false),
      size=nullif(btrim(p_product->>'size'),''),grammage=nullif(btrim(p_product->>'grammage'),''),
      nf_description=nullif(btrim(p_product->>'nf_description'),'')
    where id=v_product_id and tenant_id=v_tenant_id;
    if not found then raise exception 'Produto não encontrado'; end if;
    delete from public.product_components where product_id=v_product_id;
  end if;
  insert into public.product_components(tenant_id,product_id,component_input_id,component_product_id,quantity_type,quantity,width,length,yield_rate,lot_size,computed_quantity)
  select v_tenant_id,v_product_id,x.component_input_id,x.component_product_id,x.quantity_type::public.quantity_type,x.quantity,x.width,x.length,x.yield_rate,x.lot_size,x.computed_quantity
  from jsonb_to_recordset(p_components) x(component_input_id uuid,component_product_id uuid,quantity_type text,quantity numeric,width numeric,length numeric,yield_rate numeric,lot_size numeric,computed_quantity numeric);
  perform public.recalculate_product_costs(); return v_product_id;
end $$;

revoke execute on function public.save_product_with_components(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_product_with_components(uuid,jsonb,jsonb) to authenticated;
