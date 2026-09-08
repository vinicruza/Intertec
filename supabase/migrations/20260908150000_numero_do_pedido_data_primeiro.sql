-- O número do pedido passa a começar pela DATA (pedido da Patricia, 08/09/2026).
--
-- Nas palavras dela: "inverte a numeração do pedido; hoje está 05040926, deixa
-- 04092605 — a data vem primeiro e os dois últimos dígitos o número do pedido".
--
--   antes   05040926   = sequência(2) + ddmmaa
--   agora   04092605   = ddmmaa + sequência(2)
--
-- Ordenar por número passa a ordenar por dia, que é como a operação procura o
-- papel na mesa: primeiro o dia, depois o pedido daquele dia.
--
-- ---- A CONTAGEM DO DIA PRECISA ENXERGAR OS DOIS FORMATOS ----
--
-- Os pedidos já numerados continuam com o formato antigo — não são renumerados,
-- e não devem ser: aquele número foi impresso, foi para a mesa da conferência e
-- para o cliente. Mas a sequência do dia tem de continuar de onde parou, senão
-- dois pedidos do mesmo dia receberiam o mesmo par de dígitos e o índice único
-- recusaria o fechamento — a vendedora veria um erro no pior momento possível.
--
-- Por isso a conta olha as duas formas do MESMO dia e pega a maior sequência.
create or replace function public.next_order_number(
  p_tenant_id uuid,
  p_order_date date default ((now() at time zone 'America/Sao_Paulo')::date)
)
returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_next integer;
  v_data text := to_char(p_order_date, 'DDMMYY');
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_order_date::text, 0));

  select coalesce(max(sequencia), 0) + 1
    into v_next
    from (
      -- Formato novo: ddmmaa + sequência.
      select right(order_number, length(order_number) - 6)::integer as sequencia
        from public.orders
       where tenant_id = p_tenant_id
         and order_number ~ ('^' || v_data || '[0-9]+$')
      union all
      -- Formato antigo: sequência + ddmmaa. Continua contando, para a
      -- sequência do dia não recomeçar e colidir.
      select left(order_number, length(order_number) - 6)::integer
        from public.orders
       where tenant_id = p_tenant_id
         and order_number ~ ('^[0-9]+' || v_data || '$')
    ) as numeros_do_dia;

  return v_data || lpad(v_next::text, 2, '0');
end $$;

revoke execute on function public.next_order_number(uuid,date) from public, anon, authenticated;

comment on function public.next_order_number(uuid,date) is
  'Numero operacional do pedido: ddmmaa + sequencia do dia. Ex.: 04092605. O formato antigo (sequencia + ddmmaa) segue contando para a sequencia do dia nao colidir.';
