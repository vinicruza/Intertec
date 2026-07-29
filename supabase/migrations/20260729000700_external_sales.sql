-- Sprint F — Importação das vendas do sistema de faturamento.
--
-- Da reunião de 16/07/2026: o faturamento continua no Simples, então o sistema
-- NÃO terá 100% das vendas. O caminho acordado foi:
--
--   "Eu puxo no Simples um relatório de venda por código. E ele joga aqui?
--    Ele joga aqui e já passa."
--
-- Cruzando esse relatório com o CMV unitário que o sistema já calcula, sai o
-- CMV do mês — sem precisar recalcular nada, porque "ele já vai ter o custo
-- total dele" por código.

create table if not exists public.external_sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  -- Mês de competência da venda (primeiro dia do mês).
  period date not null,
  -- Código como veio do relatório do ERP. Guardado como veio, para auditoria:
  -- se a conciliação falhar, é este texto que explica por quê.
  source_code text not null,
  description text,
  quantity numeric not null check (quantity > 0),
  revenue numeric,
  -- Conciliação: para qual produto/kit este código apontou.
  product_id uuid references public.products (id),
  kit_id uuid references public.kits (id),
  imported_at timestamptz not null default now(),
  imported_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists external_sales_tenant_period_idx
  on public.external_sales (tenant_id, period);
create index if not exists external_sales_product_idx on public.external_sales (product_id);
create index if not exists external_sales_kit_idx on public.external_sales (kit_id);
-- Linhas que não casaram com nenhum código do catálogo: é a lista de trabalho
-- da conciliação.
create index if not exists external_sales_unmatched_idx
  on public.external_sales (tenant_id, period) where product_id is null and kit_id is null;

alter table public.external_sales enable row level security;

create policy external_sales_select on public.external_sales for select
  using (tenant_id = public.current_tenant_id() and public.current_user_role() is not null);
create policy external_sales_write on public.external_sales for all
  using (tenant_id = public.current_tenant_id() and public.current_user_role() in ('admin', 'financeiro'))
  with check (tenant_id = public.current_tenant_id() and public.current_user_role() in ('admin', 'financeiro'));

grant select, insert, update, delete on public.external_sales to authenticated;

drop trigger if exists trg_external_sales_updated_at on public.external_sales;
create trigger trg_external_sales_updated_at before update on public.external_sales
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------
-- Importação de um lote, com conciliação por código
-- ------------------------------------------------------------------
-- O código do relatório é procurado, nesta ordem, no código semântico, no
-- código de ERP e no código legado. O que não casar entra com product_id nulo
-- e aparece na lista de pendências — nunca é descartado em silêncio.
create or replace function public.import_external_sales(
  p_period date,
  p_rows jsonb,
  p_replace boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_periodo date := date_trunc('month', p_period)::date;
  v_total integer;
  v_conciliados integer;
begin
  if v_tenant_id is null then raise exception 'Usuário sem tenant ativo'; end if;
  if public.current_user_role() not in ('admin', 'financeiro') then
    raise exception 'Apenas Administrador ou Financeiro importam vendas';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nenhuma linha para importar';
  end if;

  -- Reimportar o mesmo mês substitui o lote anterior: o relatório do ERP é a
  -- fonte da verdade, e somar duas vezes o mesmo mês inventaria receita.
  if p_replace then
    delete from public.external_sales
     where tenant_id = v_tenant_id and period = v_periodo;
  end if;

  insert into public.external_sales
    (tenant_id, period, source_code, description, quantity, revenue,
     product_id, kit_id, imported_by)
  select
    v_tenant_id, v_periodo, upper(btrim(x.codigo)), nullif(btrim(x.descricao), ''),
    x.quantidade, x.receita,
    p.id, k.id, auth.uid()
  from jsonb_to_recordset(p_rows)
       as x(codigo text, descricao text, quantidade numeric, receita numeric)
  left join public.products p
    on p.tenant_id = v_tenant_id
   and upper(btrim(x.codigo)) in (upper(p.code), upper(coalesce(p.erp_code, '')), upper(coalesce(p.legacy_code, '')))
  left join public.kits k
    on p.id is null
   and k.tenant_id = v_tenant_id
   and upper(btrim(x.codigo)) in (upper(coalesce(k.code, '')), upper(coalesce(k.erp_code, '')), upper(coalesce(k.legacy_code, '')));

  select count(*), count(*) filter (where product_id is not null or kit_id is not null)
    into v_total, v_conciliados
    from public.external_sales
   where tenant_id = v_tenant_id and period = v_periodo;

  return jsonb_build_object(
    'periodo', v_periodo,
    'total', v_total,
    'conciliados', v_conciliados,
    'pendentes', v_total - v_conciliados
  );
end $$;

revoke execute on function public.import_external_sales(date, jsonb, boolean) from public, anon;
grant execute on function public.import_external_sales(date, jsonb, boolean) to authenticated;
