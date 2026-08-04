-- Nomenclatura de nota fiscal — segunda rodada, 04/08/2026: o resto do
-- catálogo, depois dos 216 campos cirúrgicos (20260804000300).
--
-- Regras novas, todas do cliente:
--   • Avental        → Avental Cirúrgico
--   • Avental Gineco → Avental Cirúrgico Sem Manga
--   • "Tag"          → "Toalha"
--   • Compressa Wiper → Toalha de Mão
--   • TNT e gramatura ("30g", "40g") somem dos aventais; **SMS fica**, ao
--     contrário do que vale para os campos.
--   • "O restante se mantém igual": os 55 produtos sem família mapeada
--     (Compressa, Conjunto, Kit, Bag, Bota, Oclusor, Perneira, Saco) saem na
--     nota com o próprio nome do catálogo, e não em branco.
--
-- Efeitos previstos, conferidos antes de aplicar — são consequência direta das
-- regras acima, não engano:
--   • "Avental Gineco" e "Avental TNT Sem Manga" passam a ter a MESMA descrição
--     de NF ("Avental Cirúrgico Sem Manga"), porque um vira sem manga e o outro
--     perde o TNT.
--   • "Avental TNT 30g ML" e "Avental TNT 40g ML" também se juntam em
--     "Avental Cirúrgico ML" — que é justamente o ponto de tirar a gramatura.
--   • "Conjunto P/M TNT" MANTÉM o TNT: a remoção foi pedida para os aventais,
--     e conjunto entra em "o restante se mantém igual".
--
-- Como na primeira rodada, a lista abaixo foi GERADA por
-- lib/nomenclatura/descricaoNF.ts sobre o catálogo — não foi escrita à mão nem
-- reimplementada em SQL, que divergiria com o tempo.

update public.products p
set nf_description = v.descricao,
    nf_description_source = 'regra',
    updated_at = now()
from (values
  ('PC-0001', 'Avental', 'Avental Cirúrgico'),
  ('PC-0017', 'Avental com Compressa', 'Avental Cirúrgico com Compressa'),
  ('PC-0018', 'Avental com Compressa Não Estéril', 'Avental Cirúrgico com Compressa Não Estéril'),
  ('PC-0007', 'Avental EGG', 'Avental Cirúrgico EGG'),
  ('PC-0023', 'Avental EGG com Compressa', 'Avental Cirúrgico EGG com Compressa'),
  ('PC-0047', 'Avental EGG com Compressa e Tag', 'Avental Cirúrgico EGG com Compressa e Toalha'),
  ('PC-0048', 'Avental EGG com Compressa e Tag Não Estéril', 'Avental Cirúrgico EGG com Compressa e Toalha Não Estéril'),
  ('PC-0024', 'Avental EGG com Compressa Não Estéril', 'Avental Cirúrgico EGG com Compressa Não Estéril'),
  ('PC-0039', 'Avental EGG com Tag', 'Avental Cirúrgico EGG com Toalha'),
  ('PC-0040', 'Avental EGG com Tag Não Estéril', 'Avental Cirúrgico EGG com Toalha Não Estéril'),
  ('PC-0008', 'Avental EGG Não Estéril', 'Avental Cirúrgico EGG Não Estéril'),
  ('PC-0003', 'Avental G', 'Avental Cirúrgico G'),
  ('PC-0019', 'Avental G com Compressa', 'Avental Cirúrgico G com Compressa'),
  ('PC-0043', 'Avental G com Compressa e Tag', 'Avental Cirúrgico G com Compressa e Toalha'),
  ('PC-0044', 'Avental G com Compressa e Tag Não Estéril', 'Avental Cirúrgico G com Compressa e Toalha Não Estéril'),
  ('PC-0020', 'Avental G com Compressa Não Estéril', 'Avental Cirúrgico G com Compressa Não Estéril'),
  ('PC-0035', 'Avental G com Tag', 'Avental Cirúrgico G com Toalha'),
  ('PC-0036', 'Avental G com Tag Não Estéril', 'Avental Cirúrgico G com Toalha Não Estéril'),
  ('PC-0029', 'Avental G Laminado', 'Avental Cirúrgico G Laminado'),
  ('PC-0030', 'Avental G Laminado Não Estéril', 'Avental Cirúrgico G Laminado Não Estéril'),
  ('PC-0004', 'Avental G Não Estéril', 'Avental Cirúrgico G Não Estéril'),
  ('PC-0005', 'Avental GG', 'Avental Cirúrgico GG'),
  ('PC-0021', 'Avental GG com Compressa', 'Avental Cirúrgico GG com Compressa'),
  ('PC-0045', 'Avental GG com Compressa e Tag', 'Avental Cirúrgico GG com Compressa e Toalha'),
  ('PC-0046', 'Avental GG com Compressa e Tag Não Estéril', 'Avental Cirúrgico GG com Compressa e Toalha Não Estéril'),
  ('PC-0022', 'Avental GG com Compressa Não Estéril', 'Avental Cirúrgico GG com Compressa Não Estéril'),
  ('PC-0037', 'Avental GG com Tag', 'Avental Cirúrgico GG com Toalha'),
  ('PC-0038', 'Avental GG com Tag Não Estéril', 'Avental Cirúrgico GG com Toalha Não Estéril'),
  ('PC-0006', 'Avental GG Não Estéril', 'Avental Cirúrgico GG Não Estéril'),
  ('PC-0031', 'Avental Gineco', 'Avental Cirúrgico Sem Manga'),
  ('PC-0032', 'Avental Gineco Não Estéril', 'Avental Cirúrgico Sem Manga Não Estéril'),
  ('PC-0027', 'Avental Laminado', 'Avental Cirúrgico Laminado'),
  ('PC-0049', 'Avental Laminado com Tag', 'Avental Cirúrgico Laminado com Toalha'),
  ('PC-0050', 'Avental Laminado com Tag Não Estéril', 'Avental Cirúrgico Laminado com Toalha Não Estéril'),
  ('PC-0028', 'Avental Laminado Não Estéril', 'Avental Cirúrgico Laminado Não Estéril'),
  ('PC-0041', 'Avental M com Compressa e Tag', 'Avental Cirúrgico M com Compressa e Toalha'),
  ('PC-0042', 'Avental M com Compressa e Tag Não Estéril', 'Avental Cirúrgico M com Compressa e Toalha Não Estéril'),
  ('PC-0033', 'Avental M com Tag', 'Avental Cirúrgico M com Toalha'),
  ('PC-0034', 'Avental M com Tag Não Estéril', 'Avental Cirúrgico M com Toalha Não Estéril'),
  ('PC-0002', 'Avental Não Estéril', 'Avental Cirúrgico Não Estéril'),
  ('PC-0025', 'Avental Sem Manga SMS', 'Avental Cirúrgico Sem Manga SMS'),
  ('PC-0026', 'Avental Sem Manga SMS Não Estéril', 'Avental Cirúrgico Sem Manga SMS Não Estéril'),
  ('PC-0015', 'Avental TNT 30g ML', 'Avental Cirúrgico ML'),
  ('PC-0016', 'Avental TNT 30g ML Não Estéril', 'Avental Cirúrgico ML Não Estéril'),
  ('PC-0013', 'Avental TNT 40g ML', 'Avental Cirúrgico ML'),
  ('PC-0014', 'Avental TNT 40g ML Não Estéril', 'Avental Cirúrgico ML Não Estéril'),
  ('PC-0009', 'Avental TNT Sem Manga', 'Avental Cirúrgico Sem Manga'),
  ('PC-0010', 'Avental TNT Sem Manga Não Estéril', 'Avental Cirúrgico Sem Manga Não Estéril'),
  ('PC-0011', 'Avental TNT Sem Manga Tam Especial', 'Avental Cirúrgico Sem Manga Tam Especial'),
  ('PC-0012', 'Avental TNT Sem Manga Tam Especial Não Estéril', 'Avental Cirúrgico Sem Manga Tam Especial Não Estéril'),
  ('PC-0063', 'Avental TNT Sem Manga Tam Especial Não Estéril Descpro', 'Avental Cirúrgico Sem Manga Tam Especial Não Estéril Descpro'),
  ('AC-0003', 'Bag Estéril', 'Bag Estéril'),
  ('AC-0004', 'Bag Não Estéril', 'Bag Não Estéril'),
  ('PC-0059', 'Bota', 'Bota'),
  ('PC-0060', 'Bota Não Estéril', 'Bota Não Estéril'),
  ('AC-0005', 'Compressa Cremer', 'Compressa Cremer'),
  ('AC-0006', 'Compressa Cremer Não Estéril', 'Compressa Cremer Não Estéril'),
  ('AC-0013', 'Compressa G', 'Compressa G'),
  ('AC-0014', 'Compressa G Não Estéril', 'Compressa G Não Estéril'),
  ('AC-0017', 'Compressa G Pacote 10', 'Compressa G Pacote 10'),
  ('AC-0018', 'Compressa G Pacote 10 Não Estéril', 'Compressa G Pacote 10 Não Estéril'),
  ('AC-0015', 'Compressa G Pacote 5', 'Compressa G Pacote 5'),
  ('AC-0016', 'Compressa G Pacote 5 Não Estéril', 'Compressa G Pacote 5 Não Estéril'),
  ('AC-0007', 'Compressa P', 'Compressa P'),
  ('AC-0008', 'Compressa P Não Estéril', 'Compressa P Não Estéril'),
  ('AC-0011', 'Compressa P Pacote 10', 'Compressa P Pacote 10'),
  ('AC-0012', 'Compressa P Pacote 10 Não Estéril', 'Compressa P Pacote 10 Não Estéril'),
  ('AC-0009', 'Compressa P Pacote 5', 'Compressa P Pacote 5'),
  ('AC-0010', 'Compressa P Pacote 5 Não Estéril', 'Compressa P Pacote 5 Não Estéril'),
  ('AC-0021', 'Compressa Pré-Lavada', 'Compressa Pré-Lavada'),
  ('AC-0022', 'Compressa Pré-Lavada Não Estéril', 'Compressa Pré-Lavada Não Estéril'),
  ('AC-0019', 'Compressa Wiper', 'Toalha de Mão'),
  ('AC-0020', 'Compressa Wiper Não Estéril', 'Toalha de Mão Não Estéril'),
  ('PC-0053', 'Conjunto G/GG', 'Conjunto G/GG'),
  ('PC-0054', 'Conjunto G/GG Não Estéril', 'Conjunto G/GG Não Estéril'),
  ('PC-0057', 'Conjunto G/GG TNT', 'Conjunto G/GG TNT'),
  ('PC-0058', 'Conjunto G/GG TNT Não Estéril', 'Conjunto G/GG TNT Não Estéril'),
  ('PC-0051', 'Conjunto P/M', 'Conjunto P/M'),
  ('PC-0052', 'Conjunto P/M Não Estéril', 'Conjunto P/M Não Estéril'),
  ('PC-0055', 'Conjunto P/M TNT', 'Conjunto P/M TNT'),
  ('PC-0056', 'Conjunto P/M TNT Não Estéril', 'Conjunto P/M TNT Não Estéril'),
  ('KC-0019', 'Kit Aleatório', 'Kit Aleatório'),
  ('KC-0003', 'Kit Catarata com 1', 'Kit Catarata com 1'),
  ('KC-0004', 'Kit Catarata com 1 Não Estéril', 'Kit Catarata com 1 Não Estéril'),
  ('KC-0001', 'Kit Catarata com 2', 'Kit Catarata com 2'),
  ('KC-0002', 'Kit Catarata com 2 Não Estéril', 'Kit Catarata com 2 Não Estéril'),
  ('KC-0005', 'Kit Londrina', 'Kit Londrina'),
  ('KC-0006', 'Kit Londrina Não Estéril', 'Kit Londrina Não Estéril'),
  ('KC-0011', 'Kit Odonto Implante', 'Kit Odonto Implante'),
  ('KC-0012', 'Kit Odonto Implante Não Estéril', 'Kit Odonto Implante Não Estéril'),
  ('KC-0013', 'Kit Odonto Pério', 'Kit Odonto Pério'),
  ('KC-0014', 'Kit Odonto Pério Não Estéril', 'Kit Odonto Pério Não Estéril'),
  ('KC-0007', 'Kit Universal Com Avental', 'Kit Universal Com Avental'),
  ('KC-0008', 'Kit Universal Com Avental Não Estéril', 'Kit Universal Com Avental Não Estéril'),
  ('KC-0009', 'Kit Universal Sem Avental', 'Kit Universal Sem Avental'),
  ('KC-0010', 'Kit Universal Sem Avental Não Estéril', 'Kit Universal Sem Avental Não Estéril'),
  ('KC-0017', 'Kit Vascular', 'Kit Vascular'),
  ('KC-0018', 'Kit Vascular Não Estéril', 'Kit Vascular Não Estéril'),
  ('KC-0015', 'Kit Veterinário', 'Kit Veterinário'),
  ('KC-0016', 'Kit Veterinário Não Estéril', 'Kit Veterinário Não Estéril'),
  ('AC-0001', 'Oclusor', 'Oclusor'),
  ('AC-0002', 'Oclusor Não Estéril', 'Oclusor Não Estéril'),
  ('PC-0061', 'Perneira', 'Perneira'),
  ('PC-0062', 'Perneira Não Estéril', 'Perneira Não Estéril'),
  ('AC-0025', 'Saco 0,40 x 0,60 Estéril', 'Saco 0,40 x 0,60 Estéril'),
  ('AC-0026', 'Saco 0,40 x 0,60 Não Estéril', 'Saco 0,40 x 0,60 Não Estéril'),
  ('AC-0023', 'Saco 0,60 x 0,90 Estéril', 'Saco 0,60 x 0,90 Estéril'),
  ('AC-0024', 'Saco 0,60 x 0,90 Não Estéril', 'Saco 0,60 x 0,90 Não Estéril')
) as v(code, nome, descricao)
where p.code = v.code and p.name = v.nome and p.nf_description is null;
