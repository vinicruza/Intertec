-- Marcação de insumo de embalagem, pedida pelo cliente em 30/07/2026 ao ver o
-- montador de kit: "por que tem toda a lista de insumos se ali deveria ser
-- apenas para colocar envelope e caixa?"
--
-- A razão de aparecer tudo é simples: o sistema nunca soube quais insumos são
-- embalagem. A tabela `inputs` guarda bobina de TNT, compressa, elástico,
-- costureira, envelope e caixa no mesmo balaio, sem nada que os separe — então
-- o montador de kit não tinha como filtrar e mostrava todos.
--
-- Esta migração dá ao sistema esse conhecimento.
--
-- DEFEITO ENCONTRADO NO CAMINHO
--
-- save_input_and_recalculate NUNCA gravou is_labor. A tela de Insumos mostra a
-- caixinha "é mão de obra" desde a Sprint A, o navegador manda o valor, e a
-- função do banco simplesmente não lista essa coluna no INSERT nem no UPDATE —
-- o valor era descartado em silêncio. Na prática: os únicos insumos marcados
-- como mão de obra hoje são os que a migração 20260729000100 marcou pelo nome
-- ("%costureira%"); ninguém nunca conseguiu marcar ou desmarcar pela tela.
--
-- Isso importa além da caixinha: o CMV sem mão de obra (usado no DRE por
-- competência) depende dessa marca. Um insumo de mão de obra novo entraria no
-- CMV de competência como se fosse material.
--
-- Corrigido abaixo, junto com a coluna nova — não faria sentido adicionar
-- is_packaging pelo mesmo caminho quebrado.

-- ------------------------------------------------------------------
-- 1. A marca de embalagem
-- ------------------------------------------------------------------
alter table public.inputs
  add column if not exists is_packaging boolean not null default false;

comment on column public.inputs.is_packaging is
  'Insumo usado como embalagem ou esterilização do kit (envelope, caixa, '
  'serviço de esterilização). Filtra a lista do montador de kit — não muda '
  'cálculo nenhum: o custo entra igual, seja qual for a marca.';

create index if not exists inputs_is_packaging_idx
  on public.inputs (tenant_id) where is_packaging;

-- Marca só o que é inequívoco pelo nome na carga atual: Envelope (10 itens),
-- Caixa (7) e Esterilização (3).
--
-- De propósito NÃO marca os duvidosos — "Bag", "Saco 40x60", "Saco 60x90",
-- "Tag", "Etiquetinha", "Etiqueta adesiva catarata", "Gráfica". Alguns podem
-- muito bem ser embalagem, mas quem sabe é a Intertech, não um palpite meu por
-- nome. Eles continuam disponíveis no montador pelo atalho "mostrar todos os
-- insumos", e o Administrador marca na tela de Insumos quando decidir.
update public.inputs
   set is_packaging = true
 where is_packaging = false
   and (lower(name) like 'envelope%'
     or lower(name) like 'caixa %'
     or lower(name) like 'esteriliza%');

-- ------------------------------------------------------------------
-- 2. Correção: gravar is_labor e is_packaging de verdade
-- ------------------------------------------------------------------
-- Mesmo corpo da versão corrente (20260715000100), com as duas colunas
-- incluídas. coalesce protege chamadas antigas que não mandem o campo.
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
      is_labor,is_packaging)
    values(v_tenant_id,btrim(p_input->>'name'),nullif(btrim(p_input->>'category'),''),
      nullif(btrim(p_input->>'purchase_unit'),''),(p_input->>'purchase_price')::numeric,
      (p_input->>'conversion_factor')::numeric,nullif(btrim(p_input->>'consumption_unit'),''),
      (p_input->>'icms_rate')::numeric,(p_input->>'pis_cofins_rate')::numeric,
      (p_input->>'price_with_tax')::numeric,(p_input->>'price_without_tax')::numeric,now(),
      coalesce((p_input->>'is_labor')::boolean,false),
      coalesce((p_input->>'is_packaging')::boolean,false))
    returning id into v_input_id;
  else
    update public.inputs set name=btrim(p_input->>'name'),category=nullif(btrim(p_input->>'category'),''),
      purchase_unit=nullif(btrim(p_input->>'purchase_unit'),''),purchase_price=(p_input->>'purchase_price')::numeric,
      conversion_factor=(p_input->>'conversion_factor')::numeric,consumption_unit=nullif(btrim(p_input->>'consumption_unit'),''),
      icms_rate=(p_input->>'icms_rate')::numeric,pis_cofins_rate=(p_input->>'pis_cofins_rate')::numeric,
      price_with_tax=(p_input->>'price_with_tax')::numeric,price_without_tax=(p_input->>'price_without_tax')::numeric,
      is_labor=coalesce((p_input->>'is_labor')::boolean,is_labor),
      is_packaging=coalesce((p_input->>'is_packaging')::boolean,is_packaging)
    where id=v_input_id and tenant_id=v_tenant_id;
    if not found then raise exception 'Insumo não encontrado'; end if;
  end if;
  perform public.recalculate_product_costs();
  return v_input_id;
end;
$$;

revoke execute on function public.save_input_and_recalculate(uuid,jsonb) from public,anon;
grant execute on function public.save_input_and_recalculate(uuid,jsonb) to authenticated;

-- Rede de segurança: se alguém reescrever a função sem as colunas, a marcação
-- volta a ser descartada em silêncio — e ninguém percebe até o DRE sair errado.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'save_input_and_recalculate'
       and p.prosrc like '%is_labor%' and p.prosrc like '%is_packaging%'
  ) then
    raise exception 'save_input_and_recalculate voltou a ignorar is_labor/is_packaging';
  end if;
end $$;
