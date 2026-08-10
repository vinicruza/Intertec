-- Segunda recodificação do catálogo, 10/08/2026 — devolutiva da cliente sobre
-- a recodificação de 05/08 (20260805000100_recodificacao_por_familia.sql).
--
-- A cliente pediu 28 famílias novas no lugar de 15 das 17 atuais (CL muda de
-- sentido, AB fica de fora da lista da cliente e continua como está — 29
-- famílias ativas ao final), para as vendedoras reconhecerem o produto pela
-- letra sem precisar abrir o catálogo. O mapeamento foi decidido em conversa
-- com o usuário, cruzando cada ponto contra o catálogo real antes de gravar:
--
--   - Formato: a cliente pediu duas letras em 05/08, mas a lista nova tem 11
--     códigos de três letras (CSU, CMM, CLB, CLM, C2B, AVC, AVT, AVS, AVL,
--     CAL, COM) — confirmado ampliar para 2-3 letras.
--   - CL muda de sentido: era Campo Lasik (8 produtos), passa a ser Campo
--     Lateral. Nenhum pedido usa código CL ainda (troca seguro), mas é a
--     segunda vez que uma letra é reaproveitada com sentido novo (a primeira
--     foi AC=Compressa em 05/08) — confirmado com o usuário.
--   - Fenestra U (4 produtos, hoje dentro de Campo Geral) não tinha código na
--     lista da cliente — decidido: entra em CF (Campo com Fenestra).
--   - Avental: 10 dos 51 produtos combinam duas características ao mesmo
--     tempo (8 "com Compressa e Tag", 2 "Laminado com Tag") e a lista da
--     cliente só tem um código por característica — decidido: a mais
--     específica vence (Laminado > Toalha > Compressa).
--   - Bag avulso (AB, 2 produtos) não estava na lista da cliente — mantido
--     como está, fora desta rodada.
--   - Conjunto (PJ, 8 produtos, vendidos como par fechado) vira CJ sem
--     mudar; Calça (CAL) e Blusa (BL) nascem como famílias vazias, para
--     peça avulsa que a cliente ainda vai cadastrar.
--   - Campo Lasik (8) se separa em CLB (Binocular, 2), CLM (Monocular, 2) e
--     C2B (Binocular "2 Bags" no nome, 4) — mesma regra "mais específica
--     vence" usada no Avental.
--   - Compressa (AC, 18) se separa em COM (16) e TO (2) — os 2 "Compressa
--     Wiper" já são "Toalha de Mão" na nota fiscal (lib/nomenclatura), a
--     família só formaliza o que já valia.
--
-- Os 117 códigos trocados abaixo (de 324 produtos) foram GERADOS por script a
-- partir do catálogo real lido do banco, não escritos à mão — mesma prática
-- da migração de 05/08: reescrever a lista à mão arrisca trocar um par sem
-- ninguém perceber.
--
-- Pedidos fechados não são afetados: o item guarda o código congelado no
-- momento da venda (item_code_snapshot), igual a toda recodificação anterior.

-- ------------------------------------------------------------------
-- 0. O formato do prefixo de categoria passa a aceitar 2 OU 3 caracteres
--    (letra + até 2 letras/dígitos) — antes só aceitava exatamente 2 letras.
-- ------------------------------------------------------------------
alter table public.product_categories
  drop constraint if exists product_categories_prefix_check;
alter table public.product_categories
  add constraint product_categories_prefix_check
  check (prefix ~ '^[A-Z][A-Z0-9]{1,2}$');

-- ------------------------------------------------------------------
-- 1. Retirar as 9 categorias sem sucessora com o mesmo prefixo, ANTES de
--    criar as novas — 8 delas têm o MESMO nome/slug de exibição que a
--    família nova que assume o papel (ex.: "Avental" existia em PA e volta a
--    existir em AV), e há índice único em (tenant_id, name) e em
--    (tenant_id, slug) que não abrem exceção para categoria inativa. Sem
--    renomear primeiro, o insert de baixo falha com "already exists". CD,
--    CG, PA, PJ, PB, PP, AC, AO, AS ficam inativas, não apagadas (preserva
--    histórico). CL segue ATIVA (não entra aqui) — muda de sentido, não é
--    retirada.
-- ------------------------------------------------------------------
update public.product_categories
   set active = false,
       name = name || ' (código antigo ' || prefix || ')',
       slug = slug || '-codigo-antigo-' || lower(prefix)
 where prefix in ('CD', 'CG', 'PA', 'PJ', 'PB', 'PP', 'AC', 'AO', 'AS');

-- ------------------------------------------------------------------
-- 2. As 29 categorias por família (substituem as 17 atuais)
-- ------------------------------------------------------------------
-- CS, CF, CA, CT, CL, CM, AB e KC já existem com este prefixo — o upsert só
-- atualiza nome/descrição/sort_order (CL muda de nome e descrição: era Campo
-- Lasik, passa a ser Campo Lateral). As outras 22 são novas.
insert into public.product_categories
  (tenant_id, name, slug, prefix, description, sort_order, erp_prefix)
select t.id, v.name, v.slug, v.prefix, v.description, v.sort_order, v.erp_prefix
from public.tenants t cross join (values
  ('Campo Simples','campo-simples','CS','Campo cirúrgico sem fenestra',10,'5'),
  ('Campo com Fenestra','campo-com-fenestra','CF','Campo cirúrgico com fenestra (inclui Fenestra U)',20,null),
  ('Campo com Adesivo','campo-com-adesivo','CA','Campo cirúrgico com adesivo',30,null),
  ('Campo Catarata','campo-catarata','CT','Campo cirúrgico com adesivo e bag, para catarata',40,null),
  ('Campo Lateral','campo-lateral','CL','Campo cirúrgico lateral',50,null),
  ('Campo Superior','campo-superior','CSU','Campo cirúrgico superior',60,null),
  ('Campo Inferior','campo-inferior','CI','Campo cirúrgico inferior',70,null),
  ('Campo de Mesa','campo-de-mesa','CM','Campo cirúrgico com reforço, para mesa',80,'4'),
  ('Campo de Mayo','campo-de-mayo','CMM','Campo cirúrgico de mayo',90,null),
  ('Campo Lasik Binocular','campo-lasik-binocular','CLB','Campo cirúrgico lasik binocular',100,null),
  ('Campo Lasik Monocular','campo-lasik-monocular','CLM','Campo cirúrgico lasik monocular',110,null),
  ('Campo Steri Drape','campo-steri-drape','SD','Steri drape',120,null),
  ('Campo com 2 Bags','campo-com-2-bags','C2B','Campo cirúrgico lasik binocular com 2 bags',130,null),
  ('Avental','avental','AV','Avental cirúrgico',140,'1'),
  ('Avental com Compressa','avental-com-compressa','AVC','Avental cirúrgico com compressa',150,null),
  ('Avental com Toalha','avental-com-toalha','AVT','Avental cirúrgico com toalha',160,null),
  ('Avental Sem Manga','avental-sem-manga','AVS','Avental cirúrgico sem manga',170,null),
  ('Avental Laminado','avental-laminado','AVL','Avental cirúrgico laminado',180,null),
  ('Conjunto','conjunto','CJ','Conjunto cirúrgico (calça e blusa)',190,'2'),
  ('Calça','calca','CAL','Calça cirúrgica avulsa',200,null),
  ('Blusa','blusa','BL','Blusa cirúrgica avulsa',210,null),
  ('Bota','bota','BO','Bota de proteção',220,'3'),
  ('Perneira','perneira','PN','Perneira de proteção',230,null),
  ('Oclusor','oclusor','OC','Oclusor',240,null),
  ('Compressa','compressa','COM','Compressas cirúrgicas',250,null),
  ('Toalha','toalha','TO','Toalha de mão',260,null),
  ('Saco','saco','SA','Saco de esterilização',270,null),
  ('Bag','bag','AB','Bag para coleta de fluido',280,null),
  ('Kit Cirúrgico','kit-cirurgico','KC','Conjuntos e kits de produtos cirúrgicos',290,null)
) as v(name, slug, prefix, description, sort_order, erp_prefix)
on conflict (tenant_id, prefix) do update
  set name = excluded.name, slug = excluded.slug, description = excluded.description,
      sort_order = excluded.sort_order, erp_prefix = excluded.erp_prefix, active = true;

-- Prefixos de ERP: PA=1/PJ=2/PB=3 migram para os sucessores diretos (AV/CJ/BO
-- acima já saem com o valor certo); CM=4 e CS=5 não mudam de letra, então
-- nada a fazer nelas. As demais 25 famílias continuam sem prefixo de ERP —
-- ninguém decidiu esses números ainda (preenchido em Cadastros → Categorias
-- de produto quando o formato do ERP for confirmado; geração desligada por
-- padrão).

-- ------------------------------------------------------------------
-- 3. Recodificar os 117 produtos que trocam de código
-- ------------------------------------------------------------------
alter table public.products drop constraint if exists products_semantic_code;

alter table public.products disable trigger trg_products_auto_code;

-- Fase 1: esvaziar CL (Campo Lasik) ANTES de qualquer coisa — a letra CL vai
-- ser reocupada pelo Campo Lateral na fase 2, e os dois conjuntos de código
-- (CL0001-CL0004 velhos e novos) coincidem como texto. Fazer em dois UPDATEs
-- separados garante que a fase 2 só escreve CL0001-CL0004 depois que a fase 1
-- já moveu os 8 produtos de Lasik para CLB/CLM/C2B — sem risco de colisão na
-- trava de unicidade (tenant_id, code).
with mapa (old_code, new_code) as (values
  ('CL0001','CLB0001'),
  ('CL0006','CLB0002'),
  ('CL0002','C2B0001'),
  ('CL0003','C2B0002'),
  ('CL0004','C2B0003'),
  ('CL0005','C2B0004'),
  ('CL0007','CLM0001'),
  ('CL0008','CLM0002')
),
alvo as (
  select p.id, m.new_code, c.id as new_category_id, c.name as new_category_name
  from public.products p
  join mapa m on m.old_code = p.code
  join public.product_categories c
    on c.tenant_id = p.tenant_id
   and c.prefix = regexp_replace(m.new_code, '[0-9]+$', '')
   and c.active
)
update public.products p
   set code = a.new_code,
       category_id = a.new_category_id,
       category = a.new_category_name,
       updated_at = now()
  from alvo a
 where p.id = a.id;

-- Fase 2: os outros 109 produtos (CL já está livre para o Campo Lateral).
with mapa (old_code, new_code) as (values
  ('CG0005','CMM0001'),
  ('CG0006','CMM0002'),
  ('CG0007','CI0001'),
  ('CG0008','CI0002'),
  ('CG0009','CI0003'),
  ('CG0010','CI0004'),
  ('CG0011','CL0001'),
  ('CG0012','CL0002'),
  ('CG0013','CL0003'),
  ('CG0014','CL0004'),
  ('CG0015','CSU0001'),
  ('CG0016','CSU0002'),
  ('CG0017','CSU0003'),
  ('CG0018','CSU0004'),
  ('CG0001','CF0045'),
  ('CG0002','CF0046'),
  ('CG0003','CF0047'),
  ('CG0004','CF0048'),
  ('AC0017','TO0001'),
  ('AC0018','TO0002'),
  ('AC0001','COM0001'),
  ('AC0002','COM0002'),
  ('AC0003','COM0003'),
  ('AC0004','COM0004'),
  ('AC0005','COM0005'),
  ('AC0006','COM0006'),
  ('AC0007','COM0007'),
  ('AC0008','COM0008'),
  ('AC0009','COM0009'),
  ('AC0010','COM0010'),
  ('AC0011','COM0011'),
  ('AC0012','COM0012'),
  ('AC0013','COM0013'),
  ('AC0014','COM0014'),
  ('AC0015','COM0015'),
  ('AC0016','COM0016'),
  ('PA0001','AV0001'),
  ('PA0004','AV0002'),
  ('PA0011','AV0003'),
  ('PA0012','AV0004'),
  ('PA0021','AV0005'),
  ('PA0022','AV0006'),
  ('PA0029','AV0007'),
  ('PA0040','AV0008'),
  ('PA0043','AV0009'),
  ('PA0044','AV0010'),
  ('PA0045','AV0011'),
  ('PA0046','AV0012'),
  ('PA0002','AVC0001'),
  ('PA0003','AVC0002'),
  ('PA0005','AVC0003'),
  ('PA0008','AVC0004'),
  ('PA0013','AVC0005'),
  ('PA0016','AVC0006'),
  ('PA0023','AVC0007'),
  ('PA0026','AVC0008'),
  ('PA0006','AVT0001'),
  ('PA0007','AVT0002'),
  ('PA0009','AVT0003'),
  ('PA0010','AVT0004'),
  ('PA0014','AVT0005'),
  ('PA0015','AVT0006'),
  ('PA0017','AVT0007'),
  ('PA0018','AVT0008'),
  ('PA0024','AVT0009'),
  ('PA0025','AVT0010'),
  ('PA0027','AVT0011'),
  ('PA0028','AVT0012'),
  ('PA0036','AVT0013'),
  ('PA0037','AVT0014'),
  ('PA0038','AVT0015'),
  ('PA0039','AVT0016'),
  ('PA0019','AVL0001'),
  ('PA0020','AVL0002'),
  ('PA0032','AVL0003'),
  ('PA0033','AVL0004'),
  ('PA0034','AVL0005'),
  ('PA0035','AVL0006'),
  ('PA0030','AVS0001'),
  ('PA0031','AVS0002'),
  ('PA0041','AVS0003'),
  ('PA0042','AVS0004'),
  ('PA0047','AVS0005'),
  ('PA0048','AVS0006'),
  ('PA0049','AVS0007'),
  ('PA0050','AVS0008'),
  ('PA0051','AVS0009'),
  ('CD0001','SD0001'),
  ('CD0002','SD0002'),
  ('CD0003','SD0003'),
  ('CD0004','SD0004'),
  ('AO0001','OC0001'),
  ('AO0002','OC0002'),
  ('AS0001','SA0001'),
  ('AS0002','SA0002'),
  ('AS0003','SA0003'),
  ('AS0004','SA0004'),
  ('PB0001','BO0001'),
  ('PB0002','BO0002'),
  ('PP0001','PN0001'),
  ('PP0002','PN0002'),
  ('PJ0001','CJ0001'),
  ('PJ0002','CJ0002'),
  ('PJ0003','CJ0003'),
  ('PJ0004','CJ0004'),
  ('PJ0005','CJ0005'),
  ('PJ0006','CJ0006'),
  ('PJ0007','CJ0007'),
  ('PJ0008','CJ0008')
),
alvo as (
  select p.id, m.new_code, c.id as new_category_id, c.name as new_category_name
  from public.products p
  join mapa m on m.old_code = p.code
  join public.product_categories c
    on c.tenant_id = p.tenant_id
   and c.prefix = regexp_replace(m.new_code, '[0-9]+$', '')
   and c.active
)
update public.products p
   set code = a.new_code,
       category_id = a.new_category_id,
       category = a.new_category_name,
       updated_at = now()
  from alvo a
 where p.id = a.id;

alter table public.products enable trigger trg_products_auto_code;

-- Histórico: uma linha por produto recodificado, código antigo e novo.
with mapa (old_code, new_code) as (values
  ('CL0001','CLB0001'), ('CL0006','CLB0002'), ('CL0002','C2B0001'), ('CL0003','C2B0002'),
  ('CL0004','C2B0003'), ('CL0005','C2B0004'), ('CL0007','CLM0001'), ('CL0008','CLM0002'),
  ('CG0005','CMM0001'), ('CG0006','CMM0002'), ('CG0007','CI0001'), ('CG0008','CI0002'),
  ('CG0009','CI0003'), ('CG0010','CI0004'), ('CG0011','CL0001'), ('CG0012','CL0002'),
  ('CG0013','CL0003'), ('CG0014','CL0004'), ('CG0015','CSU0001'), ('CG0016','CSU0002'),
  ('CG0017','CSU0003'), ('CG0018','CSU0004'), ('CG0001','CF0045'), ('CG0002','CF0046'),
  ('CG0003','CF0047'), ('CG0004','CF0048'), ('AC0017','TO0001'), ('AC0018','TO0002'),
  ('AC0001','COM0001'), ('AC0002','COM0002'), ('AC0003','COM0003'), ('AC0004','COM0004'),
  ('AC0005','COM0005'), ('AC0006','COM0006'), ('AC0007','COM0007'), ('AC0008','COM0008'),
  ('AC0009','COM0009'), ('AC0010','COM0010'), ('AC0011','COM0011'), ('AC0012','COM0012'),
  ('AC0013','COM0013'), ('AC0014','COM0014'), ('AC0015','COM0015'), ('AC0016','COM0016'),
  ('PA0001','AV0001'), ('PA0004','AV0002'), ('PA0011','AV0003'), ('PA0012','AV0004'),
  ('PA0021','AV0005'), ('PA0022','AV0006'), ('PA0029','AV0007'), ('PA0040','AV0008'),
  ('PA0043','AV0009'), ('PA0044','AV0010'), ('PA0045','AV0011'), ('PA0046','AV0012'),
  ('PA0002','AVC0001'), ('PA0003','AVC0002'), ('PA0005','AVC0003'), ('PA0008','AVC0004'),
  ('PA0013','AVC0005'), ('PA0016','AVC0006'), ('PA0023','AVC0007'), ('PA0026','AVC0008'),
  ('PA0006','AVT0001'), ('PA0007','AVT0002'), ('PA0009','AVT0003'), ('PA0010','AVT0004'),
  ('PA0014','AVT0005'), ('PA0015','AVT0006'), ('PA0017','AVT0007'), ('PA0018','AVT0008'),
  ('PA0024','AVT0009'), ('PA0025','AVT0010'), ('PA0027','AVT0011'), ('PA0028','AVT0012'),
  ('PA0036','AVT0013'), ('PA0037','AVT0014'), ('PA0038','AVT0015'), ('PA0039','AVT0016'),
  ('PA0019','AVL0001'), ('PA0020','AVL0002'), ('PA0032','AVL0003'), ('PA0033','AVL0004'),
  ('PA0034','AVL0005'), ('PA0035','AVL0006'), ('PA0030','AVS0001'), ('PA0031','AVS0002'),
  ('PA0041','AVS0003'), ('PA0042','AVS0004'), ('PA0047','AVS0005'), ('PA0048','AVS0006'),
  ('PA0049','AVS0007'), ('PA0050','AVS0008'), ('PA0051','AVS0009'), ('CD0001','SD0001'),
  ('CD0002','SD0002'), ('CD0003','SD0003'), ('CD0004','SD0004'), ('AO0001','OC0001'),
  ('AO0002','OC0002'), ('AS0001','SA0001'), ('AS0002','SA0002'), ('AS0003','SA0003'),
  ('AS0004','SA0004'), ('PB0001','BO0001'), ('PB0002','BO0002'), ('PP0001','PN0001'),
  ('PP0002','PN0002'), ('PJ0001','CJ0001'), ('PJ0002','CJ0002'), ('PJ0003','CJ0003'),
  ('PJ0004','CJ0004'), ('PJ0005','CJ0005'), ('PJ0006','CJ0006'), ('PJ0007','CJ0007'),
  ('PJ0008','CJ0008')
),
com_categoria as (
  select p.id, p.tenant_id, m.old_code, p.code as new_code
  from public.products p
  join mapa m on m.new_code = p.code
)
insert into public.catalog_code_history (tenant_id, entity_type, entity_id, old_code, new_code, reason)
select tenant_id, 'product', id, old_code, new_code, 'Recodificação detalhada por família, devolutiva da cliente, 10/08/2026'
from com_categoria
on conflict (entity_type, entity_id, new_code) do nothing;

alter table public.products
  add constraint products_semantic_code
  check (code ~ '^(CS|CF|CA|CT|CL|CSU|CI|CM|CMM|CLB|CLM|SD|C2B|AV|AVC|AVT|AVS|AVL|CJ|CAL|BL|BO|PN|OC|COM|TO|SA|AB|KC)[0-9]{4,}$');

-- Kits continuam só KC — nenhuma mudança de formato para eles.

-- ------------------------------------------------------------------
-- 4. next_category_code: casar o prefixo EXATO, não "começa com"
-- ------------------------------------------------------------------
-- Antes desta migração, todo prefixo ativo tinha exatamente 2 letras e
-- nenhum era prefixo de outro, então "code like p_prefix || '%'" funcionava.
-- Agora CS/CSU, CM/CMM, CL/CLB/CLM e AV/AVC/AVT/AVS/AVL coexistem — com LIKE,
-- gerar o próximo código de CS contaria também os produtos de CSU (e CL
-- contaria CLB/CLM), furando a sequência. A troca por uma âncora de fim de
-- string resolve: só casa o prefixo pedido, seguido só de dígitos.
create or replace function public.next_category_code(p_tenant_id uuid, p_prefix text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_next integer;
begin
  perform pg_advisory_xact_lock(hashtext('catalog:' || p_tenant_id::text || ':' || p_prefix));
  select greatest(
    coalesce((select max(substring(code from '[0-9]+$')::integer) from public.products where tenant_id = p_tenant_id and code ~ ('^' || p_prefix || '[0-9]+$')), 0),
    coalesce((select max(substring(code from '[0-9]+$')::integer) from public.kits where tenant_id = p_tenant_id and code ~ ('^' || p_prefix || '[0-9]+$')), 0)
  ) + 1 into v_next;
  return p_prefix || lpad(v_next::text, 4, '0');
end $$;
