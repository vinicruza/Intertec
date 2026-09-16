-- Bobina comprada por quilo: o cadastro passa a aceitar preço do kg + gramatura
-- (pedido do Bryan, 16/09/2026).
--
-- O PROBLEMA
--
-- A bobina é cobrada pelo fornecedor em R$/kg e consumida na ficha técnica em
-- m². O sistema já sabia multiplicar (preço de compra × fator de conversão,
-- Calculations.md §2) — mas pedia o fator PRONTO, um "0,04" que ninguém tem em
-- mãos. Quem cadastra tem a gramatura: 40 g/m², 30 g/m².
--
-- O resultado previsível: o preço do m² era calculado por fora, numa planilha, e
-- colado no campo "preço de compra" com fator 1. Foi o que se encontrou na
-- Bobina SMS 30 gr (preço 0,654, fator 1). Nesse formato, atualizar o custo
-- quando o quilo muda de preço obriga a refazer a conta na mão, fora do sistema
-- — exatamente o que o Bryan pediu para acabar.
--
-- O QUE MUDA
--
-- Duas colunas de memória de cálculo. O fator de conversão continua existindo e
-- continua sendo o que o resto do sistema lê; na bobina ele passa a ser
-- DERIVADO (gramatura ÷ 1.000) em vez de digitado.
--
--   40 g/m² → fator 0,04 → 20,00/kg × 0,04 = 0,80/m²   (com imposto)
--   30 g/m² → fator 0,03 → 22,56/kg × 0,03 = 0,6768/m² (com imposto)
--
-- NADA muda no cálculo daqui para frente: preço sem imposto, CMV, kits,
-- cascata e DRE seguem lendo preço de compra × fator de conversão e as colunas
-- de preço, como sempre. O histórico de custo também segue igual, porque o
-- gatilho que o alimenta olha o preço gravado, não a forma de chegar nele.
-- Golden tests T18, T18b e T18c.

-- ------------------------------------------------------------------
-- 1. As colunas
-- ------------------------------------------------------------------
alter table public.inputs
  add column if not exists is_roll boolean not null default false,
  add column if not exists grammage_gsm numeric;

comment on column public.inputs.is_roll is
  'Insumo de bobina: comprado por quilo e consumido por m². Quando marcado, o '
  'fator de conversão não é digitado — sai da gramatura (Calculations.md §2.1).';

comment on column public.inputs.grammage_gsm is
  'Gramatura em g/m² (40, 30...). Só para bobina. É a memória de cálculo do '
  'fator de conversão: fator = gramatura ÷ 1.000.';

-- Bobina sem gramatura daria fator zero e, com ele, preço zero em silêncio —
-- que é a família de defeito que o PRD §7 manda bloquear (bugs 3 e 4 da
-- planilha, golden test T9). A tela avisa antes; isto é a última linha.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inputs_bobina_tem_gramatura'
  ) then
    alter table public.inputs
      add constraint inputs_bobina_tem_gramatura
      check (not is_roll or (grammage_gsm is not null and grammage_gsm > 0));
  end if;
end $$;

-- ------------------------------------------------------------------
-- 2. Gravar as duas colunas de verdade
-- ------------------------------------------------------------------
-- Mesmo corpo da versão corrente (20260730000200), com as colunas novas. O
-- coalesce protege chamadas antigas que não mandem os campos; a gramatura usa
-- jsonb_exists porque, nela, mandar nulo é uma instrução ("deixou de ser
-- bobina"), diferente de não mandar nada.
create or replace function public.save_input_and_recalculate(p_input_id uuid, p_input jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_input_id uuid := p_input_id;
begin
  if v_input_id is null then
    insert into public.inputs(tenant_id,name,category,purchase_unit,purchase_price,conversion_factor,
      consumption_unit,icms_rate,pis_cofins_rate,price_with_tax,price_without_tax,price_updated_at,
      is_labor,is_packaging,is_roll,grammage_gsm)
    values(v_tenant_id,btrim(p_input->>'name'),nullif(btrim(p_input->>'category'),''),
      nullif(btrim(p_input->>'purchase_unit'),''),(p_input->>'purchase_price')::numeric,
      (p_input->>'conversion_factor')::numeric,nullif(btrim(p_input->>'consumption_unit'),''),
      (p_input->>'icms_rate')::numeric,(p_input->>'pis_cofins_rate')::numeric,
      (p_input->>'price_with_tax')::numeric,(p_input->>'price_without_tax')::numeric,now(),
      coalesce((p_input->>'is_labor')::boolean,false),
      coalesce((p_input->>'is_packaging')::boolean,false),
      coalesce((p_input->>'is_roll')::boolean,false),
      (p_input->>'grammage_gsm')::numeric)
    returning id into v_input_id;
  else
    update public.inputs set name=btrim(p_input->>'name'),category=nullif(btrim(p_input->>'category'),''),
      purchase_unit=nullif(btrim(p_input->>'purchase_unit'),''),purchase_price=(p_input->>'purchase_price')::numeric,
      conversion_factor=(p_input->>'conversion_factor')::numeric,consumption_unit=nullif(btrim(p_input->>'consumption_unit'),''),
      icms_rate=(p_input->>'icms_rate')::numeric,pis_cofins_rate=(p_input->>'pis_cofins_rate')::numeric,
      price_with_tax=(p_input->>'price_with_tax')::numeric,price_without_tax=(p_input->>'price_without_tax')::numeric,
      is_labor=coalesce((p_input->>'is_labor')::boolean,is_labor),
      is_packaging=coalesce((p_input->>'is_packaging')::boolean,is_packaging),
      is_roll=coalesce((p_input->>'is_roll')::boolean,is_roll),
      grammage_gsm=case when jsonb_exists(p_input,'grammage_gsm')
                        then (p_input->>'grammage_gsm')::numeric
                        else grammage_gsm end
    where id=v_input_id and tenant_id=v_tenant_id;
    if not found then raise exception 'Insumo não encontrado'; end if;
  end if;
  perform public.recalculate_product_costs();
  return v_input_id;
end;
$$;

revoke execute on function public.save_input_and_recalculate(uuid,jsonb) from public,anon;
grant execute on function public.save_input_and_recalculate(uuid,jsonb) to authenticated;

-- Rede de segurança, na linha da que 20260730000200 deixou: se alguém
-- reescrever a função sem as colunas, a bobina volta a gravar sem gramatura e
-- ninguém percebe até o custo precisar ser atualizado.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'save_input_and_recalculate'
       and p.prosrc like '%is_labor%' and p.prosrc like '%is_packaging%'
       and p.prosrc like '%is_roll%' and p.prosrc like '%grammage_gsm%'
  ) then
    raise exception 'save_input_and_recalculate voltou a ignorar is_roll/grammage_gsm';
  end if;
end $$;
