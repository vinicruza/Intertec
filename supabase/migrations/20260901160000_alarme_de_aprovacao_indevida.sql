-- ============================================================
-- O alarme que faltava: aprovação automática abaixo do selo
-- ============================================================
--
-- Em 01/09/2026 o gatilho da aprovação automática lia as faixas de STATUS do
-- painel ("Boa" começa em 40%, cor 'green') em vez do selo comercial (onde 40%
-- ainda é amarela). As duas usam a palavra "green" para faixas diferentes, e
-- foi isso que fez a divergência sobreviver a leituras de código e a testes.
--
-- 21 orçamentos foram aprovados sozinhos entre 41,12% e 49,95%. Quem percebeu
-- foi uma pessoa olhando um pedido — não o sistema.
--
-- A correção da regra impede ESTE erro. Este arquivo é sobre o próximo: uma
-- verificação que não depende de qual regra quebrou. Ela compara o que foi
-- aprovado SOZINHO com o selo vigente, e qualquer divergência futura aparece
-- na tela de Integridade, venha de onde vier.
--
-- Aprovação MANUAL de margem baixa não entra na conta: um humano pode aprovar
-- o que quiser — é exatamente para isso que a fila de aprovação existe.
--
-- ---------- Por que existe a ratificação ----------
--
-- Pedido já FECHADO é imutável (Decisão D7): não dá para corrigir a aprovação
-- dele, e não deveria dar. Mas um alarme que nunca zera deixa de ser lido, e o
-- buraco seguinte passa despercebido do mesmo jeito.
--
-- Então a saída não é apagar o alarme: é alguém com autoridade dizer "eu vi,
-- revisei e aceito". Fica no audit_logs, com nome, data e motivo obrigatório,
-- e o pedido sai da contagem. O histórico permanece; o que muda é que a
-- pendência passa a ter dono.

create or replace function public.ratificar_aprovacao_automatica(p_order_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_order public.orders%rowtype;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Só o Administrador pode ratificar uma aprovação automática.';
  end if;
  if nullif(btrim(coalesce(p_motivo,'')),'') is null then
    raise exception 'Escreva o motivo da ratificação: é ele que explica a decisão a quem ler depois.';
  end if;

  select * into v_order from public.orders where id=p_order_id and tenant_id=v_tenant_id;
  if not found then raise exception 'Pedido não encontrado'; end if;

  insert into public.audit_logs(tenant_id,entity,entity_id,action,old_value,new_value,user_id)
  values(v_tenant_id,'orders',p_order_id,'ratifica_aprovacao_automatica',
    jsonb_build_object('approval_notes', v_order.approval_notes,
                       'margem_pct', case when coalesce(v_order.net_revenue_snapshot,0)=0 then null
                                          else round((v_order.contribution_margin_snapshot/v_order.net_revenue_snapshot)*100,2) end),
    jsonb_build_object('motivo', btrim(p_motivo)),
    auth.uid());
end $$;

revoke execute on function public.ratificar_aprovacao_automatica(uuid,text) from public, anon;
grant execute on function public.ratificar_aprovacao_automatica(uuid,text) to authenticated;

-- A contagem nova entra no resumo de integridade, ao lado das outras.
create or replace function public.get_data_quality_summary()
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare v_tenant_id uuid:=public.current_tenant_id(); v_role public.user_role:=public.current_user_role();
begin
  if v_role not in ('admin','financeiro') then raise exception 'Sem permissão para consultar integridade'; end if;
  return jsonb_build_object(
    'products_without_components',(select count(*) from products p where p.tenant_id=v_tenant_id and p.status='active' and not exists(select 1 from product_components c where c.product_id=p.id)),
    'products_without_valid_cmv',(select count(*) from products p left join product_costs pc on pc.product_id=p.id where p.tenant_id=v_tenant_id and p.status='active' and coalesce(pc.cmv,0)<=0),
    'empty_kits',(select count(*) from kits k where k.tenant_id=v_tenant_id and k.status='active' and not exists(select 1 from kit_items i where i.kit_id=k.id)),
    'kit_items_without_cmv',(select count(*) from kit_items i left join product_costs pc on pc.product_id=i.product_id where i.tenant_id=v_tenant_id and coalesce(pc.cmv,0)<=0),
    'orders_without_items',(select count(*) from orders o where o.tenant_id=v_tenant_id and not exists(select 1 from order_items i where i.order_id=o.id)),
    'closed_orders_without_snapshot',(select count(*) from orders o where o.tenant_id=v_tenant_id and o.status='closed' and (o.closed_at is null or o.cmv_total_snapshot is null or o.gross_revenue_snapshot is null)),
    'customers_without_uf',(select count(*) from customers c where c.tenant_id=v_tenant_id and c.active and nullif(btrim(c.uf),'') is null),
    'commercial_users_without_seller',(select count(*) from profiles p
       where p.tenant_id=v_tenant_id and p.active and p.role='comercial'
         and not exists(select 1 from sellers s
                         where s.tenant_id=p.tenant_id and s.active
                           and lower(btrim(s.name))=lower(btrim(p.full_name)))),
    'auto_approved_below_seal',(select count(*) from orders o
       where o.tenant_id=v_tenant_id
         and o.cancelled_at is null
         and o.approval_status='aprovado'
         and o.approval_notes ilike 'Aprovado automaticamente pela margem%'
         and o.net_revenue_snapshot is not null and o.net_revenue_snapshot<>0
         and public.selo_comercial_do_pedido(o.id, o.contribution_margin_snapshot/o.net_revenue_snapshot)
             in ('red','yellow')
         and not exists (select 1 from audit_logs a
                          where a.entity='orders' and a.entity_id=o.id
                            and a.action='ratifica_aprovacao_automatica')),
    'active_products_without_open_allocation',coalesce((
      select case when ep.id is null then count(p.id) else count(p.id) filter(where ea.id is null) end
      from products p
      left join lateral(select id from expense_allocation_periods where tenant_id=v_tenant_id and status='open' order by period desc limit 1) ep on true
      left join expense_allocations ea on ea.period_id=ep.id and ea.product_id=p.id
      where p.tenant_id=v_tenant_id and p.status='active'
      group by ep.id),0),
    'checked_at',now()
  );
end $function$;
