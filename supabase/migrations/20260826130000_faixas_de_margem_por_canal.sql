-- ============================================================
-- Faixas de margem comercial por canal e por vendedor
-- Pedido da Intertech em 26/08/2026.
-- ============================================================
--
-- "É possível deixar uma faixa diferente para as vendas da Mari/Marketplace?
-- Até 29,99 vermelho, 30 a 39,99 amarelo, 40% fica verde e pode prosseguir,
-- acima de 50% azul."
--
-- Sim — e a resposta foi além do pedido de propósito: em vez de gravar o caso
-- da Mari no código, as faixas viram dado editável. Marketplace vende com
-- estrutura de custo diferente do Interno, e a próxima vez que isso mudar não
-- deve exigir programador.
--
-- ---------- Por que uma tabela nova, e não `margin_rules` ----------
--
-- `margin_rules` já existe e é editável, mas é outra coisa: são as faixas de
-- STATUS do painel (Boa / Atenção / Crítica / Negativa), sem escopo por canal.
-- O selo comercial é o que decide se o pedido segue sozinho ou vai para
-- aprovação — quatro cores fixas, e agora com escopo. Misturar os dois numa
-- tabela só faria cada tela ter de filtrar o que não é seu.
--
-- ---------- Como se lê ----------
--
-- Três tetos, na mesma semântica que o código já usava (menor ou igual):
--
--   pct <= red_max     -> Vermelha
--   pct <= yellow_max  -> Amarela
--   pct <= green_max   -> Verde
--   acima disso        -> Azul
--
-- Vermelha e Amarela exigem aprovação; Verde e Azul seguem sozinhas.
--
-- O 0,2999 da Mari não é capricho: "até 29,99" é literalmente o que a
-- Intertech pediu, e o teto inclusivo é o que faz 30,00% cair no amarelo e
-- 40,00% no verde.
create table if not exists public.commercial_margin_bands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  -- Escopo, do mais geral para o mais específico. Os dois nulos = padrão da
  -- casa, usado por quem não tem faixa própria.
  channel_id uuid references public.channels(id),
  seller_id uuid references public.sellers(id),
  red_max numeric not null,
  yellow_max numeric not null,
  green_max numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint commercial_margin_bands_ordem check (red_max < yellow_max and yellow_max < green_max),
  constraint commercial_margin_bands_faixa check (
    red_max > 0 and red_max < 1 and yellow_max > 0 and yellow_max < 1 and green_max > 0 and green_max < 1
  ),
  -- `nulls not distinct`: sem isso o Postgres trataria cada linha de padrão
  -- como diferente das outras e deixaria cadastrar duas.
  constraint commercial_margin_bands_escopo unique nulls not distinct (tenant_id, channel_id, seller_id)
);

create index if not exists commercial_margin_bands_tenant_idx
  on public.commercial_margin_bands(tenant_id);

alter table public.commercial_margin_bands enable row level security;

-- Mesma política dos demais parâmetros fiscais: todos que operam leem, só o
-- Administrador escreve. Quem vende não muda a régua pela qual é medido.
create policy commercial_margin_bands_select on public.commercial_margin_bands for select
  using (tenant_id = public.current_tenant_id()
         and public.current_user_role() in ('admin','financeiro','comercial'));

create policy commercial_margin_bands_admin_write on public.commercial_margin_bands for all
  using (tenant_id = public.current_tenant_id() and public.current_user_role() = 'admin')
  with check (tenant_id = public.current_tenant_id() and public.current_user_role() = 'admin');

-- Auditoria e updated_at, como as outras tabelas de parâmetro.
create trigger commercial_margin_bands_touch
  before update on public.commercial_margin_bands
  for each row execute function public.set_updated_at();

-- ---------- Conteúdo ----------
--
-- Padrão da casa: exatamente os números que estavam no código antes desta
-- migração (40 / 50 / 65). Ninguém muda de faixa ao aplicar isto.
insert into public.commercial_margin_bands (tenant_id, channel_id, seller_id, red_max, yellow_max, green_max)
select t.id, null, null, 0.40, 0.50, 0.65
  from public.tenants t
 where not exists (
   select 1 from public.commercial_margin_bands b
    where b.tenant_id = t.id and b.channel_id is null and b.seller_id is null
 );

-- Marketplace, como a Intertech ditou.
insert into public.commercial_margin_bands (tenant_id, channel_id, seller_id, red_max, yellow_max, green_max)
select c.tenant_id, c.id, null, 0.2999, 0.3999, 0.50
  from public.channels c
 where c.name = 'Marketplace'
   and not exists (
     select 1 from public.commercial_margin_bands b
      where b.tenant_id = c.tenant_id and b.channel_id = c.id and b.seller_id is null
   );
