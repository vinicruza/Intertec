-- ============================================================
-- A aprovacao automatica passa a usar o SELO COMERCIAL
-- Relatado pela Intertech em 01/09/2026.
-- ============================================================
--
-- "A Isabela conseguiu aprovar um pedido com margem baixa, não deveria."
--
-- Orcamento ORC-2026-0129, margem de 41,12%. A tela mostrava "Amarela ·
-- 41,12%" e dizia que precisava de aprovacao. O banco aprovou sozinho, com a
-- nota "Aprovado automaticamente pela margem green".
--
-- ---------- Duas reguas com o mesmo nome de cor ----------
--
-- O sistema tem duas tabelas de faixa, e elas nao querem dizer a mesma coisa:
--
--   margin_rules              faixas de STATUS do painel (Boa / Atencao /
--                             Critica / Negativa). "Boa" comeca em 40% e a
--                             cor dela e 'green'.
--
--   commercial_margin_bands   o SELO do pedido, que decide se ele segue
--                             sozinho ou para na aprovacao. Ali 40% ainda e
--                             AMARELA; verde so comeca acima de 50%.
--
-- O gatilho da aprovacao automatica lia a PRIMEIRA. Como as duas usam a
-- palavra "green" para coisas diferentes, o erro passou despercebido: entre
-- 40% e 50% a tela dizia amarela e o banco aprovava como verde.
--
-- Efeito medido antes da correcao: 21 orcamentos aprovados sozinhos dentro
-- dessa faixa, de 41,12% a 49,95%, sendo 3 ja fechados como pedido.
--
-- Agora o gatilho le a mesma regua da tela e do fechamento — inclusive a faixa
-- por canal, entao Marketplace usa a dele.

-- Selo comercial do pedido, em SQL, com a mesma precedencia da versao em
-- TypeScript (`faixaDoPedido` + `seloMargemComercial`): vendedor > canal >
-- padrao da casa, e os mesmos tetos inclusivos.
create or replace function public.selo_comercial_do_pedido(p_order_id uuid, p_pct numeric)
returns text
language sql
stable
set search_path=public,pg_temp
as $$
  with faixa as (
    select b.red_max, b.yellow_max, b.green_max
      from public.orders o
      join public.commercial_margin_bands b
        on b.tenant_id = o.tenant_id
       and (b.seller_id = o.seller_id
            or (b.seller_id is null and b.channel_id = o.channel_id)
            or (b.seller_id is null and b.channel_id is null))
     where o.id = p_order_id
     order by (b.seller_id is not null) desc, (b.channel_id is not null) desc
     limit 1
  ), tetos as (
    select coalesce((select red_max from faixa), 0.40) as red_max,
           coalesce((select yellow_max from faixa), 0.50) as yellow_max,
           coalesce((select green_max from faixa), 0.65) as green_max
  )
  select case
           when p_pct is null then null
           when p_pct <= (select red_max from tetos) then 'red'
           when p_pct <= (select yellow_max from tetos) then 'yellow'
           when p_pct <= (select green_max from tetos) then 'green'
           else 'blue'
         end;
$$;

create or replace function public.sync_order_snapshot_from_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receita_bruta numeric;
  v_receita_liquida numeric;
  v_cmv_total numeric;
  v_margem numeric;
  v_margem_pct numeric;
  v_totals jsonb;
  v_color text;
begin
  v_receita_bruta := coalesce(
    nullif(new.snapshot #>> '{pedido,gross_revenue_snapshot}', '')::numeric,
    nullif(new.snapshot ->> 'receita_bruta', '')::numeric
  );

  v_cmv_total := coalesce(
    nullif(new.snapshot #>> '{pedido,cmv_total_snapshot}', '')::numeric,
    nullif(new.snapshot ->> 'cmv_total', '')::numeric
  );

  v_margem := coalesce(
    nullif(new.snapshot #>> '{pedido,contribution_margin_snapshot}', '')::numeric,
    nullif(new.snapshot ->> 'margem_contribuicao', '')::numeric
  );

  v_receita_liquida := coalesce(
    nullif(new.snapshot #>> '{pedido,net_revenue_snapshot}', '')::numeric,
    nullif(new.snapshot ->> 'receita_liquida', '')::numeric,
    v_margem + v_cmv_total
  );

  v_margem_pct := coalesce(
    nullif(new.snapshot #>> '{pedido,contribution_margin_pct_snapshot}', '')::numeric,
    nullif(new.snapshot ->> 'margem_contribuicao_pct', '')::numeric,
    case when v_receita_liquida is null or v_receita_liquida = 0 then null else v_margem / v_receita_liquida end
  );

  -- Ate 01/09/2026 esta cor saia de `margin_rules` — as faixas de STATUS do
  -- painel, onde "Boa" comeca em 40% e e verde. Só que quem decide aprovacao e
  -- o SELO COMERCIAL, onde 40% ainda e amarela e verde so comeca acima de 50%.
  --
  -- As duas tabelas discordavam justamente na faixa de 40% a 50%, e era a
  -- errada que mandava: 21 orcamentos foram aprovados sozinhos ali dentro. A
  -- tela mostrava "Amarela — precisa de aprovacao" e o banco aprovava como
  -- verde no mesmo instante.
  if v_margem_pct is not null then
    v_color := public.selo_comercial_do_pedido(new.order_id, v_margem_pct);
  end if;

  v_totals := coalesce(
    new.snapshot #> '{pedido,totals_display}',
    case
      when v_receita_liquida is null and v_margem is null then null
      else jsonb_strip_nulls(jsonb_build_object(
        'receita_liquida', case when v_receita_liquida is null then null else round(v_receita_liquida, 2)::text end,
        'margem_contribuicao', case when v_margem is null then null else round(v_margem, 2)::text end
      ))
    end
  );

  update public.orders
     set gross_revenue_snapshot = coalesce(v_receita_bruta, gross_revenue_snapshot),
         net_revenue_snapshot = coalesce(v_receita_liquida, net_revenue_snapshot),
         cmv_total_snapshot = coalesce(v_cmv_total, cmv_total_snapshot),
         contribution_margin_snapshot = coalesce(v_margem, contribution_margin_snapshot),
         totals_display = coalesce(v_totals, totals_display),
         approval_status = case
           when v_color in ('blue', 'green') and status = 'simulation' then 'aprovado'::approval_status
           else approval_status
         end,
         approved_at = case
           when v_color in ('blue', 'green') and status = 'simulation' then coalesce(approved_at, now())
           else approved_at
         end,
         approved_by = case
           when v_color in ('blue', 'green') and status = 'simulation' then coalesce(approved_by, new.created_by)
           else approved_by
         end,
         approval_notes = case
           when v_color in ('blue', 'green') and status = 'simulation'
             then 'Aprovado automaticamente pela margem ' || coalesce(v_color, '')
           else approval_notes
         end
   where id = new.order_id
     and tenant_id = new.tenant_id;

  return new;
end $$;

drop trigger if exists trg_order_versions_sync_order_snapshot on public.order_versions;
create trigger trg_order_versions_sync_order_snapshot
after insert on public.order_versions
for each row execute function public.sync_order_snapshot_from_version();

revoke execute on function public.sync_order_snapshot_from_version() from public, anon, authenticated;
