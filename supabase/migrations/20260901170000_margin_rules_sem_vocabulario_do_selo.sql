-- ============================================================
-- As faixas do PAINEL deixam de usar as cores do SELO
-- Causa raiz do erro de 01/09/2026.
-- ============================================================
--
-- O sistema tem duas tabelas de faixa:
--
--   margin_rules              status do painel: Boa / Atenção / Crítica /
--                             Negativa. "Boa" começa em 40%.
--
--   commercial_margin_bands   o selo do pedido, que decide aprovação. Ali 40%
--                             ainda é amarela, e verde só começa acima de 50%.
--
-- As duas guardavam a palavra 'green'. O gatilho da aprovação automática leu a
-- primeira achando que era a segunda — e, como o valor "green" existia nas
-- duas, nada reclamou: nem o Postgres, nem o TypeScript, nem os testes. A
-- divergência só aparecia na faixa de 40% a 50%, e 21 orçamentos foram
-- aprovados sozinhos antes de uma pessoa notar.
--
-- Consertar quem lê qual (eac6fbd) resolve ESTE erro. Isto resolve a família
-- dele: se as duas tabelas não compartilharem mais nenhuma palavra, confundir
-- uma com a outra deixa de ser possível. E a tentativa de reintroduzir a
-- ambiguidade passa a ser recusada pelo BANCO, não por revisão de código.
--
-- Renomear é seguro: a coluna não pinta nada em tela nenhuma. O painel filtra
-- e classifica pelo `label` ("Crítica", "Negativa"), e o único consumidor de
-- verdade da cor era justamente o gatilho da aprovação. Em Configurações ela
-- aparece como campo de texto editável, e passa a ser um rótulo de status.
update public.margin_rules set color = case lower(coalesce(color,''))
    when 'green'  then 'status_boa'
    when 'yellow' then 'status_atencao'
    when 'orange' then 'status_critica'
    when 'red'    then 'status_negativa'
    else 'status_' || lower(coalesce(nullif(btrim(color),''), 'sem_cor'))
  end
where color is null or color !~ '^status_';

alter table public.margin_rules
  drop constraint if exists margin_rules_nao_usa_cores_do_selo;

alter table public.margin_rules
  add constraint margin_rules_nao_usa_cores_do_selo
  check (color is null or lower(color) not in ('green','yellow','orange','red','blue'));

comment on column public.margin_rules.color is
  'Rotulo de status do painel (status_boa, status_atencao, ...). NUNCA usar o vocabulario do selo comercial (green/yellow/red/blue): foi a palavra compartilhada que causou a aprovacao indevida de 01/09/2026. Ver commercial_margin_bands para o selo que decide aprovacao.';
