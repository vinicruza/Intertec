-- Nomenclatura de nota fiscal dos Campos Cirúrgicos — regra combinada com o
-- cliente em 04/08/2026 ("começar pelos campos").
--
-- O nome do catálogo carrega detalhe de fabricação — gramatura (GR30/GR40),
-- matéria-prima (TNT/SMS) e origem ("China") — que serve para custo e produção
-- mas não deve sair impresso na nota fiscal. A coluna `nf_description`, criada
-- em 30/07/2026 (20260730000300) e vazia nos 324 produtos até aqui, passa a
-- guardar o nome fiscal. O nome interno do catálogo NÃO muda: é ele que
-- sustenta CMV, ficha técnica e histórico.
--
-- A regra em si vive em lib/nomenclatura/descricaoNF.ts, com testes por
-- família. A lista abaixo foi GERADA por aquela função sobre o catálogo atual
-- — não foi escrita à mão, e não é uma segunda cópia da regra em SQL, que
-- poderia divergir com o tempo. São 216 campos → 139 descrições distintas,
-- porque gramatura e matéria-prima deixaram de diferenciar.

-- Como cada descrição foi escrita. Serve para que uma próxima rodada da regra
-- — quando entrarem aventais, conjuntos, campos novos — nunca apague em
-- silêncio um texto que a Intertech tenha ajustado à mão.
alter table public.products
  add column if not exists nf_description_source text
    check (nf_description_source in ('regra', 'manual'));

comment on column public.products.nf_description_source is
  'Como a descrição de NF foi escrita: "regra" (gerada por '
  'lib/nomenclatura/descricaoNF.ts) ou "manual" (ajustada por uma pessoa, e '
  'portanto intocável pela regra). Nulo quando não há descrição.';

-- Preenche só onde ainda não há nada. Casa por código E por nome: se alguém
-- tiver renomeado um produto entre a geração desta lista e a aplicação da
-- migração, aquele produto fica de fora em vez de receber o nome fiscal de um
-- produto que ele não é mais.
update public.products p
set nf_description = v.descricao,
    nf_description_source = 'regra',
    updated_at = now()
from (values
  ('CC-0001', 'Campo Catarata 1,00 x 1,20 GR40', 'Campo Cirúrgico com Adesivo e Bag 1,00 x 1,20'),
  ('CC-0002', 'Campo Catarata 1,00 x 1,20 GR40 Não Estéril', 'Campo Cirúrgico com Adesivo e Bag 1,00 x 1,20 Não Estéril'),
  ('CC-0003', 'Campo Catarata 0,60 x 0,60 GR40', 'Campo Cirúrgico com Adesivo e Bag 0,60 x 0,60'),
  ('CC-0004', 'Campo Catarata 0,60 x 0,60 GR40 Não Estéril', 'Campo Cirúrgico com Adesivo e Bag 0,60 x 0,60 Não Estéril'),
  ('CC-0005', 'Campo Catarata 0,80 x 0,80 GR40', 'Campo Cirúrgico com Adesivo e Bag 0,80 x 0,80'),
  ('CC-0006', 'Campo Catarata 0,80 x 0,80 GR40 Não Estéril', 'Campo Cirúrgico com Adesivo e Bag 0,80 x 0,80 Não Estéril'),
  ('CC-0007', 'Campo de Mesa 1,00 x 1,20', 'Campo Cirúrgico com Reforço 1,00 x 1,20'),
  ('CC-0008', 'Campo de Mesa 1,00 x 1,20 Não Estéril', 'Campo Cirúrgico com Reforço 1,00 x 1,20 Não Estéril'),
  ('CC-0009', 'Campo de Mesa 1,00 x 1,40', 'Campo Cirúrgico com Reforço 1,00 x 1,40'),
  ('CC-0010', 'Campo de Mesa 1,00 x 1,40 Não Estéril', 'Campo Cirúrgico com Reforço 1,00 x 1,40 Não Estéril'),
  ('CC-0011', 'Campo de Mesa 0,70 x 0,70', 'Campo Cirúrgico com Reforço 0,70 x 0,70'),
  ('CC-0012', 'Campo de Mesa 0,70 x 0,70 Não Estéril', 'Campo Cirúrgico com Reforço 0,70 x 0,70 Não Estéril'),
  ('CC-0013', 'Campo de Mesa 0,70 x 1,00', 'Campo Cirúrgico com Reforço 0,70 x 1,00'),
  ('CC-0014', 'Campo de Mesa 0,70 x 1,00 Não Estéril', 'Campo Cirúrgico com Reforço 0,70 x 1,00 Não Estéril'),
  ('CC-0015', 'Campo de Mesa 0,50 x 0,70', 'Campo Cirúrgico com Reforço 0,50 x 0,70'),
  ('CC-0016', 'Campo de Mesa 0,50 x 0,70 Não Estéril', 'Campo Cirúrgico com Reforço 0,50 x 0,70 Não Estéril'),
  ('CC-0017', 'Campo de Mesa 2,00 x 1,40', 'Campo Cirúrgico com Reforço 2,00 x 1,40'),
  ('CC-0018', 'Campo de Mesa 2,00 x 1,40 Não Estéril', 'Campo Cirúrgico com Reforço 2,00 x 1,40 Não Estéril'),
  ('CC-0019', 'Campo de Mesa 2,00 x 1,30', 'Campo Cirúrgico com Reforço 2,00 x 1,30'),
  ('CC-0020', 'Campo de Mesa 2,00 x 1,30 Não Estéril', 'Campo Cirúrgico com Reforço 2,00 x 1,30 Não Estéril'),
  ('CC-0021', 'Campo de Mesa 1,50 x 1,70', 'Campo Cirúrgico com Reforço 1,50 x 1,70'),
  ('CC-0022', 'Campo de Mesa 1,50 x 1,70 Não Estéril', 'Campo Cirúrgico com Reforço 1,50 x 1,70 Não Estéril'),
  ('CC-0023', 'Campo de Mesa 1,00 x 1,70', 'Campo Cirúrgico com Reforço 1,00 x 1,70'),
  ('CC-0024', 'Campo de Mesa 1,00 x 1,70 Não Estéril', 'Campo Cirúrgico com Reforço 1,00 x 1,70 Não Estéril'),
  ('CC-0025', 'Campo de Mesa 1,00 x 1,00', 'Campo Cirúrgico com Reforço 1,00 x 1,00'),
  ('CC-0026', 'Campo de Mesa 1,00 x 1,00 Não Estéril', 'Campo Cirúrgico com Reforço 1,00 x 1,00 Não Estéril'),
  ('CC-0027', 'Campo de Mesa 1,30 x 1,70', 'Campo Cirúrgico com Reforço 1,30 x 1,70'),
  ('CC-0028', 'Campo de Mesa 1,30 x 1,70 Não Estéril', 'Campo Cirúrgico com Reforço 1,30 x 1,70 Não Estéril'),
  ('CC-0029', 'Campo de Mesa 2,00 x 2,00', 'Campo Cirúrgico com Reforço 2,00 x 2,00'),
  ('CC-0030', 'Campo de Mesa 2,00 x 2,00 Não Estéril', 'Campo Cirúrgico com Reforço 2,00 x 2,00 Não Estéril'),
  ('CC-0031', 'Campo de Mesa 1,50 x 1,50', 'Campo Cirúrgico com Reforço 1,50 x 1,50'),
  ('CC-0032', 'Campo de Mesa 2,00 x 2,00 Não Estéril', 'Campo Cirúrgico com Reforço 2,00 x 2,00 Não Estéril'),
  ('CC-0033', 'Campo de Mesa 1,50 x 1,50 + Tape 50cm', 'Campo Cirúrgico com Reforço 1,50 x 1,50 + Tape 50cm'),
  ('CC-0034', 'Campo de Mesa 1,50 x 1,50  + Tape 50cm Não Estéril', 'Campo Cirúrgico com Reforço 1,50 x 1,50 + Tape 50cm Não Estéril'),
  ('CC-0035', 'Campo de Mesa 1,50 x 1,50 + Tape 1m', 'Campo Cirúrgico com Reforço 1,50 x 1,50 + Tape 1m'),
  ('CC-0036', 'Campo de Mesa 1,50 x 1,50  + Tape 1m Não Estéril', 'Campo Cirúrgico com Reforço 1,50 x 1,50 + Tape 1m Não Estéril'),
  ('CC-0037', 'Campo de Mesa 1,30 x 1,80', 'Campo Cirúrgico com Reforço 1,30 x 1,80'),
  ('CC-0038', 'Campo de Mesa 1,30 x 1,80 Não Estéril', 'Campo Cirúrgico com Reforço 1,30 x 1,80 Não Estéril'),
  ('CC-0039', 'Campo de Mesa 1,30 x 1,30', 'Campo Cirúrgico com Reforço 1,30 x 1,30'),
  ('CC-0040', 'Campo de Mesa 1,30 x 1,30 Não Estéril', 'Campo Cirúrgico com Reforço 1,30 x 1,30 Não Estéril'),
  ('CC-0041', 'Campo de Mesa 1,00 x 1,50', 'Campo Cirúrgico com Reforço 1,00 x 1,50'),
  ('CC-0042', 'Campo de Mesa 1,00 x 1,50 Não Estéril', 'Campo Cirúrgico com Reforço 1,00 x 1,50 Não Estéril'),
  ('CC-0043', 'Campo de Mesa 2,00 x 3,00 com Fenestra + Tape 40cm', 'Campo Cirúrgico com Reforço 2,00 x 3,00 com Fenestra + Tape 40cm'),
  ('CC-0044', 'Campo de Mesa 2,00 x 3,00 com Fenestra + Tape 40cm Não Estéril', 'Campo Cirúrgico com Reforço 2,00 x 3,00 com Fenestra + Tape 40cm Não Estéril'),
  ('CC-0045', 'Campo de Mesa 0,70 x 0,70 + Tape 10cm Superior e Inferior', 'Campo Cirúrgico com Reforço 0,70 x 0,70 + Tape 10cm Superior e Inferior'),
  ('CC-0046', 'Campo de Mesa 0,70 x 0,70 + Tape 10cm Superior e Inferior Não Estéril', 'Campo Cirúrgico com Reforço 0,70 x 0,70 + Tape 10cm Superior e Inferior Não Estéril'),
  ('CC-0047', 'Campo Simples 1,00 x 1,20 GR40', 'Campo Cirúrgico Sem Fenestra 1,00 x 1,20'),
  ('CC-0048', 'Campo Simples 1,00 x 1,20 Não Estéril GR40', 'Campo Cirúrgico Sem Fenestra 1,00 x 1,20 Não Estéril'),
  ('CC-0049', 'Campo Simples 0,60 x 0,60 GR40', 'Campo Cirúrgico Sem Fenestra 0,60 x 0,60'),
  ('CC-0050', 'Campo Simples 0,60 x 0,60 Não Estéril GR40', 'Campo Cirúrgico Sem Fenestra 0,60 x 0,60 Não Estéril'),
  ('CC-0051', 'Campo Simples 0,80 x 0,80 GR40', 'Campo Cirúrgico Sem Fenestra 0,80 x 0,80'),
  ('CC-0052', 'Campo Simples 0,80 x 0,80 Não Estéril GR40', 'Campo Cirúrgico Sem Fenestra 0,80 x 0,80 Não Estéril'),
  ('CC-0053', 'Campo Simples 1,00 x 1,00 GR40', 'Campo Cirúrgico Sem Fenestra 1,00 x 1,00'),
  ('CC-0054', 'Campo Simples 1,00 x 1,00 Não Estéril GR40', 'Campo Cirúrgico Sem Fenestra 1,00 x 1,00 Não Estéril'),
  ('CC-0055', 'Campo Simples 2,00 x 1,20 GR40', 'Campo Cirúrgico Sem Fenestra 2,00 x 1,20'),
  ('CC-0056', 'Campo Simples 2,00 x 1,20 Não Estéril GR40', 'Campo Cirúrgico Sem Fenestra 2,00 x 1,20 Não Estéril'),
  ('CC-0057', 'Campo Simples 0,60 x 1,20 GR40', 'Campo Cirúrgico Sem Fenestra 0,60 x 1,20'),
  ('CC-0058', 'Campo Simples 0,60 x 1,20 Não Estéril GR40', 'Campo Cirúrgico Sem Fenestra 0,60 x 1,20 Não Estéril'),
  ('CC-0059', 'Campo Simples 1,50 x 1,50 GR40', 'Campo Cirúrgico Sem Fenestra 1,50 x 1,50'),
  ('CC-0060', 'Campo Simples 1,50 x 1,50 Não Estéril GR40', 'Campo Cirúrgico Sem Fenestra 1,50 x 1,50 Não Estéril'),
  ('CC-0061', 'Campo Simples 0,40 x 0,40 GR40', 'Campo Cirúrgico Sem Fenestra 0,40 x 0,40'),
  ('CC-0062', 'Campo Simples 0,40 x 0,40 Não Estéril GR40', 'Campo Cirúrgico Sem Fenestra 0,40 x 0,40 Não Estéril'),
  ('CC-0063', 'Campo Simples 0,40 x 0,40 GR30', 'Campo Cirúrgico Sem Fenestra 0,40 x 0,40'),
  ('CC-0064', 'Campo Simples 0,40 x 0,40 Não Estéril GR30', 'Campo Cirúrgico Sem Fenestra 0,40 x 0,40 Não Estéril'),
  ('CC-0065', 'Campo Simples 0,50 x 0,50 GR40', 'Campo Cirúrgico Sem Fenestra 0,50 x 0,50'),
  ('CC-0066', 'Campo Simples 0,50 x 0,50 Não Estéril GR40', 'Campo Cirúrgico Sem Fenestra 0,50 x 0,50 Não Estéril'),
  ('CC-0067', 'Campo Simples 0,50 x 0,50 GR30', 'Campo Cirúrgico Sem Fenestra 0,50 x 0,50'),
  ('CC-0068', 'Campo Simples 0,50 x 0,50 Não Estéril GR30', 'Campo Cirúrgico Sem Fenestra 0,50 x 0,50 Não Estéril'),
  ('CC-0069', 'Campo Simples 1,50 x 2,00 GR40', 'Campo Cirúrgico Sem Fenestra 1,50 x 2,00'),
  ('CC-0070', 'Campo Simples 1,50 x 2,00 Não Estéril GR40', 'Campo Cirúrgico Sem Fenestra 1,50 x 2,00 Não Estéril'),
  ('CC-0071', 'Campo Simples 1,50 x 2,00 GR30', 'Campo Cirúrgico Sem Fenestra 1,50 x 2,00'),
  ('CC-0072', 'Campo Simples 1,00 x 1,40 GR40', 'Campo Cirúrgico Sem Fenestra 1,00 x 1,40'),
  ('CC-0073', 'Campo Simples 1,00 x 1,40 GR40 Não Estéril', 'Campo Cirúrgico Sem Fenestra 1,00 x 1,40 Não Estéril'),
  ('CC-0074', 'Campo Simples 1,00 x 1,40 GR30', 'Campo Cirúrgico Sem Fenestra 1,00 x 1,40'),
  ('CC-0075', 'Campo Simples 1,00 x 1,40 GR30 Não Estéril', 'Campo Cirúrgico Sem Fenestra 1,00 x 1,40 Não Estéril'),
  ('CC-0076', 'Campo Simples 1,50 x 2,00 Não Estéril GR30', 'Campo Cirúrgico Sem Fenestra 1,50 x 2,00 Não Estéril'),
  ('CC-0077', 'Campo Simples 1,50 x 1,50 + Tape 50cm GR40', 'Campo Cirúrgico Sem Fenestra 1,50 x 1,50 + Tape 50cm'),
  ('CC-0078', 'Campo Simples 1,50 x 1,50 + Tape 50cm Não Estéril GR40', 'Campo Cirúrgico Sem Fenestra 1,50 x 1,50 + Tape 50cm Não Estéril'),
  ('CC-0079', 'Campo Simples 1,50 x 1,50 + Tape 50cm GR30', 'Campo Cirúrgico Sem Fenestra 1,50 x 1,50 + Tape 50cm'),
  ('CC-0080', 'Campo Simples 1,50 x 1,50 + Tape 50cm Não Estéril GR30', 'Campo Cirúrgico Sem Fenestra 1,50 x 1,50 + Tape 50cm Não Estéril'),
  ('CC-0081', 'Campo Simples 1,00 x 1,60 + Tape 50cm GR40', 'Campo Cirúrgico Sem Fenestra 1,00 x 1,60 + Tape 50cm'),
  ('CC-0082', 'Campo Simples 1,00 x 1,60 + Tape 50cm Não Estéril GR40', 'Campo Cirúrgico Sem Fenestra 1,00 x 1,60 + Tape 50cm Não Estéril'),
  ('CC-0083', 'Campo Simples 1,00 x 1,60 + Tape 50cm GR30', 'Campo Cirúrgico Sem Fenestra 1,00 x 1,60 + Tape 50cm'),
  ('CC-0084', 'Campo Simples 1,00 x 1,60 + Tape 50cm Não Estéril GR30', 'Campo Cirúrgico Sem Fenestra 1,00 x 1,60 + Tape 50cm Não Estéril'),
  ('CC-0085', 'Campo Simples 1,50 x 1,80 + Tape 1,5m GR40', 'Campo Cirúrgico Sem Fenestra 1,50 x 1,80 + Tape 1,5m'),
  ('CC-0086', 'Campo Simples 1,50 x 1,80 + Tape 1,5m Não Estéril GR40', 'Campo Cirúrgico Sem Fenestra 1,50 x 1,80 + Tape 1,5m Não Estéril'),
  ('CC-0087', 'Campo Simples 1,50 x 1,80 + Tape 1,5m GR30', 'Campo Cirúrgico Sem Fenestra 1,50 x 1,80 + Tape 1,5m'),
  ('CC-0088', 'Campo Simples 1,50 x 1,80 + Tape 1,5m Não Estéril GR30', 'Campo Cirúrgico Sem Fenestra 1,50 x 1,80 + Tape 1,5m Não Estéril'),
  ('CC-0089', 'Campo Com Adesivo 1,00 x 1,20 GR40', 'Campo Cirúrgico com Adesivo 1,00 x 1,20'),
  ('CC-0090', 'Campo Com Adesivo 1,00 x 1,20 Não Estéril GR40', 'Campo Cirúrgico com Adesivo 1,00 x 1,20 Não Estéril'),
  ('CC-0091', 'Campo Com Adesivo 0,60 x 0,60 GR40', 'Campo Cirúrgico com Adesivo 0,60 x 0,60'),
  ('CC-0092', 'Campo Com Adesivo 0,60 x 0,60 Não Estéril GR40', 'Campo Cirúrgico com Adesivo 0,60 x 0,60 Não Estéril'),
  ('CC-0093', 'Campo Com Adesivo 0,50 x 0,50 GR40', 'Campo Cirúrgico com Adesivo 0,50 x 0,50'),
  ('CC-0094', 'Campo Com Adesivo 0,50 x 0,50 Não Estéril GR40', 'Campo Cirúrgico com Adesivo 0,50 x 0,50 Não Estéril'),
  ('CC-0095', 'Campo Com Adesivo 0,40 x 0,40 GR40', 'Campo Cirúrgico com Adesivo 0,40 x 0,40'),
  ('CC-0096', 'Campo Com Adesivo 0,40 x 0,40 Não Estéril GR40', 'Campo Cirúrgico com Adesivo 0,40 x 0,40 Não Estéril'),
  ('CC-0097', 'Campo Com Adesivo 0,80 x 0,80 GR40', 'Campo Cirúrgico com Adesivo 0,80 x 0,80'),
  ('CC-0098', 'Campo Com Adesivo 0,80 x 0,80 Não Estéril GR40', 'Campo Cirúrgico com Adesivo 0,80 x 0,80 Não Estéril'),
  ('CC-0099', 'Campo Com Adesivo 0,80 x 0,80 Não Estéril GR30', 'Campo Cirúrgico com Adesivo 0,80 x 0,80 Não Estéril'),
  ('CC-0100', 'Campo Com Adesivo 0,80 x 0,80 Não Estéril GR40', 'Campo Cirúrgico com Adesivo 0,80 x 0,80 Não Estéril'),
  ('CC-0101', 'Campo Com Fenestra 1,00 x 1,20 GR40', 'Campo Cirúrgico com Fenestra 1,00 x 1,20'),
  ('CC-0102', 'Campo Com Fenestra 1,00 x 1,20 Não Estéril GR40', 'Campo Cirúrgico com Fenestra 1,00 x 1,20 Não Estéril'),
  ('CC-0103', 'Campo Com Fenestra 0,60 x 0,60 GR40', 'Campo Cirúrgico com Fenestra 0,60 x 0,60'),
  ('CC-0104', 'Campo Com Fenestra 0,60 x 0,60 Não Estéril GR40', 'Campo Cirúrgico com Fenestra 0,60 x 0,60 Não Estéril'),
  ('CC-0105', 'Campo Com Fenestra 0,40 x 0,40 GR40', 'Campo Cirúrgico com Fenestra 0,40 x 0,40'),
  ('CC-0106', 'Campo Com Fenestra 0,40 x 0,40 Não Estéril GR40', 'Campo Cirúrgico com Fenestra 0,40 x 0,40 Não Estéril'),
  ('CC-0107', 'Campo Com Fenestra 0,50 x 0,50 GR40', 'Campo Cirúrgico com Fenestra 0,50 x 0,50'),
  ('CC-0108', 'Campo Com Fenestra 0,50 x 0,50 Não Estéril GR40', 'Campo Cirúrgico com Fenestra 0,50 x 0,50 Não Estéril'),
  ('CC-0109', 'Campo Com Fenestra 0,80 x 0,80 GR40', 'Campo Cirúrgico com Fenestra 0,80 x 0,80'),
  ('CC-0110', 'Campo Com Fenestra 0,80 x 0,80 Não Estéril GR40', 'Campo Cirúrgico com Fenestra 0,80 x 0,80 Não Estéril'),
  ('CC-0111', 'Campo Com Fenestra 1,00 x 1,00 GR40', 'Campo Cirúrgico com Fenestra 1,00 x 1,00'),
  ('CC-0112', 'Campo Com Fenestra 1,00 x 1,00 Não Estéril GR40', 'Campo Cirúrgico com Fenestra 1,00 x 1,00 Não Estéril'),
  ('CC-0113', 'Campo Com Fenestra 1,00 x 1,50 GR40', 'Campo Cirúrgico com Fenestra 1,00 x 1,50'),
  ('CC-0114', 'Campo Com Fenestra 1,00 x 1,50 Não Estéril GR40', 'Campo Cirúrgico com Fenestra 1,00 x 1,50 Não Estéril'),
  ('CC-0115', 'Campo Com Fenestra 1,00 x 1,50 GR30', 'Campo Cirúrgico com Fenestra 1,00 x 1,50'),
  ('CC-0116', 'Campo Com Fenestra 1,00 x 1,50 Não Estéril GR30', 'Campo Cirúrgico com Fenestra 1,00 x 1,50 Não Estéril'),
  ('CC-0117', 'Campo Com Fenestra 1,50 x 2,00 GR40', 'Campo Cirúrgico com Fenestra 1,50 x 2,00'),
  ('CC-0118', 'Campo Com Fenestra 1,50 x 2,00 Não Estéril GR40', 'Campo Cirúrgico com Fenestra 1,50 x 2,00 Não Estéril'),
  ('CC-0119', 'Campo Com Fenestra 1,50 x 2,00 GR30', 'Campo Cirúrgico com Fenestra 1,50 x 2,00'),
  ('CC-0120', 'Campo Com Fenestra 1,50 x 2,00 Não Estéril GR30', 'Campo Cirúrgico com Fenestra 1,50 x 2,00 Não Estéril'),
  ('CC-0121', 'Campo Lateral 1,00 x 1,60', 'Campo Cirúrgico Lateral 1,00 x 1,60'),
  ('CC-0122', 'Campo Lateral 1,00 x 1,60 Não Estéril', 'Campo Cirúrgico Lateral 1,00 x 1,60 Não Estéril'),
  ('CC-0123', 'Campo Inferior 1,60 x 2,00', 'Campo Cirúrgico Inferior 1,60 x 2,00'),
  ('CC-0124', 'Campo Inferior 1,60 x 2,00 Não Estéril', 'Campo Cirúrgico Inferior 1,60 x 2,00 Não Estéril'),
  ('CC-0125', 'Campo Superior 1,60 x 2,60', 'Campo Cirúrgico Superior 1,60 x 2,60'),
  ('CC-0126', 'Campo Superior 1,60 x 2,60 Não Estéril', 'Campo Cirúrgico Superior 1,60 x 2,60 Não Estéril'),
  ('CC-0127', 'Campo Lateral Laminado 1,00 x 1,60', 'Campo Cirúrgico Lateral Laminado 1,00 x 1,60'),
  ('CC-0128', 'Campo Lateral Laminado 1,00 x 1,60 Não Estéril', 'Campo Cirúrgico Lateral Laminado 1,00 x 1,60 Não Estéril'),
  ('CC-0129', 'Campo Inferior Laminado 1,60 x 2,00', 'Campo Cirúrgico Inferior Laminado 1,60 x 2,00'),
  ('CC-0130', 'Campo Inferior Laminado 1,60 x 2,00 Não Estéril', 'Campo Cirúrgico Inferior Laminado 1,60 x 2,00 Não Estéril'),
  ('CC-0131', 'Campo Superior Laminado 1,60 x 2,60', 'Campo Cirúrgico Superior Laminado 1,60 x 2,60'),
  ('CC-0132', 'Campo Superior 1,60 x 2,60 Laminado Não Estéril', 'Campo Cirúrgico Superior 1,60 x 2,60 Laminado Não Estéril'),
  ('CC-0133', 'Campo 1,60 x 2,00 Fenestra U', 'Campo Cirúrgico 1,60 x 2,00 Fenestra U'),
  ('CC-0134', 'Campo 1,60 x 2,00 Fenestra U Não Estéril', 'Campo Cirúrgico 1,60 x 2,00 Fenestra U Não Estéril'),
  ('CC-0135', 'Campo 1,60 x 2,00 Laminado Fenestra U', 'Campo Cirúrgico 1,60 x 2,00 Laminado Fenestra U'),
  ('CC-0136', 'Campo 1,60 x 2,00 Laminado Fenestra U Não Estéril', 'Campo Cirúrgico 1,60 x 2,00 Laminado Fenestra U Não Estéril'),
  ('CC-0137', 'Campo Lasik Monocular', 'Campo Cirúrgico com Adesivo e 2 Bags Monocular'),
  ('CC-0138', 'Campo Lasik Monocular Não Estéril', 'Campo Cirúrgico com Adesivo e 2 Bags Monocular Não Estéril'),
  ('CC-0139', 'Campo Lasik Binocular', 'Campo Cirúrgico com Adesivo e 2 Bags Binocular'),
  ('CC-0140', 'Campo Lasik Binocular Não Estéril', 'Campo Cirúrgico com Adesivo e 2 Bags Binocular Não Estéril'),
  ('CC-0141', 'Campo Lasik Binocular 1,00 X 1,20 2 Bags GR 40', 'Campo Cirúrgico com Adesivo e 2 Bags Binocular 1,00 X 1,20 2 Bags'),
  ('CC-0142', 'Campo Lasik Binocular 1,00 X 1,20 2 Bags GR 40 Não Estéril', 'Campo Cirúrgico com Adesivo e 2 Bags Binocular 1,00 X 1,20 2 Bags Não Estéril'),
  ('CC-0143', 'Campo Lasik Binocular 1,00 X 1,20 2 Bags GR 30', 'Campo Cirúrgico com Adesivo e 2 Bags Binocular 1,00 X 1,20 2 Bags'),
  ('CC-0144', 'Campo Lasik Binocular 1,00 X 1,20 2 Bags GR 30 Não Estéril', 'Campo Cirúrgico com Adesivo e 2 Bags Binocular 1,00 X 1,20 2 Bags Não Estéril'),
  ('CC-0145', 'Steri Drape Grande', 'Campo Cirúrgico Steri Drape G'),
  ('CC-0146', 'Steri Drape Grande Não Estéril', 'Campo Cirúrgico Steri Drape G Não Estéril'),
  ('CC-0147', 'Steri Drape Pequeno', 'Campo Cirúrgico Steri Drape P'),
  ('CC-0148', 'Steri Drape Pequeno Não Estéril', 'Campo Cirúrgico Steri Drape P Não Estéril'),
  ('CC-0149', 'Campo de Mayo', 'Campo Cirúrgico de Mayo'),
  ('CC-0150', 'Campo de Mayo Não Estéril', 'Campo Cirúrgico de Mayo Não Estéril'),
  ('CC-0151', 'Campo com Fenestra TNT GR30 1,40 x 2,00', 'Campo Cirúrgico com Fenestra 1,40 x 2,00'),
  ('CC-0152', 'Campo com Fenestra TNT GR30 1,40 x 2,00 Não Estéril', 'Campo Cirúrgico com Fenestra 1,40 x 2,00 Não Estéril'),
  ('CC-0153', 'Campo com Fenestra TNT GR 30 1,40 x 0,60', 'Campo Cirúrgico com Fenestra 1,40 x 0,60'),
  ('CC-0154', 'Campo com Fenestra TNT GR 30 1,40 x 0,60 Não Estéril', 'Campo Cirúrgico com Fenestra 1,40 x 0,60 Não Estéril'),
  ('CC-0155', 'Campo com Fenestra TNT GR 40 1,40 x 2,00', 'Campo Cirúrgico com Fenestra 1,40 x 2,00'),
  ('CC-0156', 'Campo com Fenestra TNT GR 40 1,40 x 2,00 Não Estéril', 'Campo Cirúrgico com Fenestra 1,40 x 2,00 Não Estéril'),
  ('CC-0157', 'Campo com Fenestra TNT 1,40 x 0,60', 'Campo Cirúrgico com Fenestra 1,40 x 0,60'),
  ('CC-0158', 'Campo com Fenestra TNT 1,40 x 0,60 Não Estéril', 'Campo Cirúrgico com Fenestra 1,40 x 0,60 Não Estéril'),
  ('CC-0159', 'Campo de mesa 1,00x1,40 Adesivo 14x15 +Fen', 'Campo Cirúrgico com Reforço 1,00x1,40 Adesivo 14x15 +Fen'),
  ('CC-0160', 'Campo de mesa 1,00x1,40 Adesivo 14x15 +Fen Não Estéril', 'Campo Cirúrgico com Reforço 1,00x1,40 Adesivo 14x15 +Fen Não Estéril'),
  ('CC-0161', 'Campo Catarata 1,00 x 1,20 GR30', 'Campo Cirúrgico com Adesivo e Bag 1,00 x 1,20'),
  ('CC-0162', 'Campo Catarata 1,00 x 1,20 GR30 Não Estéril', 'Campo Cirúrgico com Adesivo e Bag 1,00 x 1,20 Não Estéril'),
  ('CC-0163', 'Campo Catarata 0,60 x 0,60 GR30', 'Campo Cirúrgico com Adesivo e Bag 0,60 x 0,60'),
  ('CC-0164', 'Campo Catarata 0,60 x 0,60 GR30 Não Estéril', 'Campo Cirúrgico com Adesivo e Bag 0,60 x 0,60 Não Estéril'),
  ('CC-0165', 'Campo Catarata 0,80 x 0,80 GR30', 'Campo Cirúrgico com Adesivo e Bag 0,80 x 0,80'),
  ('CC-0166', 'Campo Catarata 0,80 x 0,80 GR30 Não Estéril', 'Campo Cirúrgico com Adesivo e Bag 0,80 x 0,80 Não Estéril'),
  ('CC-0167', 'Campo Simples 1,00 x 1,20 GR30', 'Campo Cirúrgico Sem Fenestra 1,00 x 1,20'),
  ('CC-0168', 'Campo Simples 1,00 x 1,20 Não Estéril GR30', 'Campo Cirúrgico Sem Fenestra 1,00 x 1,20 Não Estéril'),
  ('CC-0169', 'Campo Simples 0,60 x 0,60 GR30', 'Campo Cirúrgico Sem Fenestra 0,60 x 0,60'),
  ('CC-0170', 'Campo Simples 0,60 x 0,60 Não Estéril GR30', 'Campo Cirúrgico Sem Fenestra 0,60 x 0,60 Não Estéril'),
  ('CC-0171', 'Campo Simples 0,80 x 0,80 GR30', 'Campo Cirúrgico Sem Fenestra 0,80 x 0,80'),
  ('CC-0172', 'Campo Simples 0,80 x 0,80 Não Estéril GR30', 'Campo Cirúrgico Sem Fenestra 0,80 x 0,80 Não Estéril'),
  ('CC-0173', 'Campo Simples 1,00 x 1,00 GR30', 'Campo Cirúrgico Sem Fenestra 1,00 x 1,00'),
  ('CC-0174', 'Campo Simples 1,00 x 1,00 Não Estéril GR30', 'Campo Cirúrgico Sem Fenestra 1,00 x 1,00 Não Estéril'),
  ('CC-0175', 'Campo Simples 2,00 x 1,20 GR30', 'Campo Cirúrgico Sem Fenestra 2,00 x 1,20'),
  ('CC-0176', 'Campo Simples 2,00 x 1,20 Não Estéril GR30', 'Campo Cirúrgico Sem Fenestra 2,00 x 1,20 Não Estéril'),
  ('CC-0177', 'Campo Simples 2,00 x 2,00 GR30', 'Campo Cirúrgico Sem Fenestra 2,00 x 2,00'),
  ('CC-0178', 'Campo Simples 2,00 x 2,00 Não Estéril GR30', 'Campo Cirúrgico Sem Fenestra 2,00 x 2,00 Não Estéril'),
  ('CC-0179', 'Campo Simples 2,00 x 2,00 GR40', 'Campo Cirúrgico Sem Fenestra 2,00 x 2,00'),
  ('CC-0180', 'Campo Simples 2,00 x 2,00 Não Estéril GR40', 'Campo Cirúrgico Sem Fenestra 2,00 x 2,00 Não Estéril'),
  ('CC-0181', 'Campo Simples 0,60 x 1,20 GR30', 'Campo Cirúrgico Sem Fenestra 0,60 x 1,20'),
  ('CC-0182', 'Campo Simples 0,60 x 1,20 Não Estéril GR30', 'Campo Cirúrgico Sem Fenestra 0,60 x 1,20 Não Estéril'),
  ('CC-0183', 'Campo Simples 1,50 x 1,50 GR30', 'Campo Cirúrgico Sem Fenestra 1,50 x 1,50'),
  ('CC-0184', 'Campo Simples 1,50 x 1,50 Não Estéril GR30', 'Campo Cirúrgico Sem Fenestra 1,50 x 1,50 Não Estéril'),
  ('CC-0185', 'Campo Com Adesivo 1,00 x 1,20 GR30', 'Campo Cirúrgico com Adesivo 1,00 x 1,20'),
  ('CC-0186', 'Campo Com Adesivo 1,00 x 1,20 Não Estéril GR30', 'Campo Cirúrgico com Adesivo 1,00 x 1,20 Não Estéril'),
  ('CC-0187', 'Campo Com Adesivo 0,60 x 0,60 GR30', 'Campo Cirúrgico com Adesivo 0,60 x 0,60'),
  ('CC-0188', 'Campo Com Adesivo 0,60 x 0,60 Não Estéril GR30', 'Campo Cirúrgico com Adesivo 0,60 x 0,60 Não Estéril'),
  ('CC-0189', 'Campo Com Adesivo 0,50 x 0,50 GR30', 'Campo Cirúrgico com Adesivo 0,50 x 0,50'),
  ('CC-0190', 'Campo Com Adesivo 0,50 x 0,50 Não Estéril GR30', 'Campo Cirúrgico com Adesivo 0,50 x 0,50 Não Estéril'),
  ('CC-0191', 'Campo Com Adesivo 0,40 x 0,40 GR30', 'Campo Cirúrgico com Adesivo 0,40 x 0,40'),
  ('CC-0192', 'Campo Com Adesivo 0,40 x 0,40 Não Estéril GR30', 'Campo Cirúrgico com Adesivo 0,40 x 0,40 Não Estéril'),
  ('CC-0193', 'Campo Com Fenestra 1,00 x 1,20 GR30', 'Campo Cirúrgico com Fenestra 1,00 x 1,20'),
  ('CC-0194', 'Campo Com Fenestra 1,00 x 1,20 Não Estéril GR30', 'Campo Cirúrgico com Fenestra 1,00 x 1,20 Não Estéril'),
  ('CC-0195', 'Campo Com Fenestra 0,60 x 0,60 GR30', 'Campo Cirúrgico com Fenestra 0,60 x 0,60'),
  ('CC-0196', 'Campo Com Fenestra 0,60 x 0,60 Não Estéril GR30', 'Campo Cirúrgico com Fenestra 0,60 x 0,60 Não Estéril'),
  ('CC-0197', 'Campo Com Fenestra 0,40 x 0,40 GR30', 'Campo Cirúrgico com Fenestra 0,40 x 0,40'),
  ('CC-0198', 'Campo Com Fenestra 0,40 x 0,40 Não Estéril GR30', 'Campo Cirúrgico com Fenestra 0,40 x 0,40 Não Estéril'),
  ('CC-0199', 'Campo Com Fenestra 0,50 x 0,50 GR30', 'Campo Cirúrgico com Fenestra 0,50 x 0,50'),
  ('CC-0200', 'Campo Com Fenestra 0,50 x 0,50 Não Estéril GR30', 'Campo Cirúrgico com Fenestra 0,50 x 0,50 Não Estéril'),
  ('CC-0201', 'Campo Com Fenestra 0,80 x 0,80 GR30', 'Campo Cirúrgico com Fenestra 0,80 x 0,80'),
  ('CC-0202', 'Campo Com Fenestra 0,80 x 0,80 Não Estéril GR30', 'Campo Cirúrgico com Fenestra 0,80 x 0,80 Não Estéril'),
  ('CC-0203', 'Campo Com Fenestra 1,00 x 1,00 GR30', 'Campo Cirúrgico com Fenestra 1,00 x 1,00'),
  ('CC-0204', 'Campo Com Fenestra 1,00 x 1,00 Não Estéril GR30', 'Campo Cirúrgico com Fenestra 1,00 x 1,00 Não Estéril'),
  ('CC-0205', 'Campo Catarata 1,00 x 1,20 GR30 China', 'Campo Cirúrgico com Adesivo e Bag 1,00 x 1,20'),
  ('CC-0206', 'Campo Catarata 1,00 x 1,20 GR30 Não Estéril China', 'Campo Cirúrgico com Adesivo e Bag 1,00 x 1,20 Não Estéril'),
  ('CC-0207', 'Campo Catarata 0,60 x 0,60 GR30 China', 'Campo Cirúrgico com Adesivo e Bag 0,60 x 0,60'),
  ('CC-0208', 'Campo Catarata 0,60 x 0,60 GR30 Não Estéril China', 'Campo Cirúrgico com Adesivo e Bag 0,60 x 0,60 Não Estéril'),
  ('CC-0209', 'Campo Catarata 0,80 x 0,80 GR30 China', 'Campo Cirúrgico com Adesivo e Bag 0,80 x 0,80'),
  ('CC-0210', 'Campo Catarata 0,80 x 0,80 GR30 Não Estéril China', 'Campo Cirúrgico com Adesivo e Bag 0,80 x 0,80 Não Estéril'),
  ('CC-0211', 'Campo Com Fenestra 0,80 x 0,80 + Tape 20cm GR40', 'Campo Cirúrgico com Fenestra 0,80 x 0,80 + Tape 20cm'),
  ('CC-0212', 'Campo Com Fenestra 0,80 x 0,80 + Tape 20cm Não Estéril GR40', 'Campo Cirúrgico com Fenestra 0,80 x 0,80 + Tape 20cm Não Estéril'),
  ('CC-0213', 'Campo Com Fenestra 0,80 x 0,80 + Tape 20cm Não Estéril GR30', 'Campo Cirúrgico com Fenestra 0,80 x 0,80 + Tape 20cm Não Estéril'),
  ('CC-0214', 'Campo Com Fenestra 0,80 x 0,80 + Tape 20cm Não Estéril GR40', 'Campo Cirúrgico com Fenestra 0,80 x 0,80 + Tape 20cm Não Estéril'),
  ('CC-0215', 'Campo de Mesa 1,30 x 2,00 + Fen Bino', 'Campo Cirúrgico com Reforço 1,30 x 2,00 + Fen Bino'),
  ('CC-0216', 'Campo de Mesa 1,30 x 2,00 + Fen Bino Não Estéril', 'Campo Cirúrgico com Reforço 1,30 x 2,00 + Fen Bino Não Estéril')
) as v(code, nome, descricao)
where p.code = v.code and p.name = v.nome and p.nf_description is null;

-- Mesmo corpo de save_product_with_components (20260730000300), agora gravando
-- também de onde veio a descrição de NF. A tela manda 'regra' quando o texto
-- salvo é igual ao que a regra produz e 'manual' quando alguém o alterou.
create or replace function public.save_product_with_components(p_product_id uuid,p_product jsonb,p_components jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_tenant_id uuid:=public.current_tenant_id(); v_product_id uuid:=p_product_id; v_category_id uuid;
  v_nf_description text:=nullif(btrim(p_product->>'nf_description'),'');
  v_nf_source text:=nullif(btrim(p_product->>'nf_description_source'),'');
begin
  if jsonb_typeof(p_components)<>'array' or jsonb_array_length(p_components)=0 then raise exception 'Produto deve possuir ao menos um componente'; end if;
  begin v_category_id:=(p_product->>'category_id')::uuid; exception when others then raise exception 'Categoria é obrigatória'; end;
  if not exists(select 1 from public.product_categories where id=v_category_id and tenant_id=v_tenant_id and active) then raise exception 'Categoria inválida ou inativa'; end if;
  -- Sem descrição não há origem. Com descrição e sem origem válida no que
  -- chegou — navegador ainda na versão anterior, por exemplo, entre aplicar
  -- esta migração e publicar a tela — a origem gravada NÃO é adivinhada: no
  -- update ela se mantém como está (ver o case lá embaixo) e no insert vira
  -- 'manual', que é o lado seguro, porque a regra nunca reescreve o que não
  -- reconhece como seu.
  if v_nf_description is null then v_nf_source:=null;
  elsif v_nf_source is null or v_nf_source not in ('regra','manual') then v_nf_source:=null; end if;
  if v_product_id is null then
    insert into public.products(tenant_id,code,name,category_id,type,sterile,size,grammage,nf_description,nf_description_source)
    values(v_tenant_id,null,btrim(p_product->>'name'),v_category_id,nullif(btrim(p_product->>'type'),''),
      coalesce((p_product->>'sterile')::boolean,false),nullif(btrim(p_product->>'size'),''),nullif(btrim(p_product->>'grammage'),''),
      v_nf_description,case when v_nf_description is null then null else coalesce(v_nf_source,'manual') end)
    returning id into v_product_id;
  else
    update public.products set name=btrim(p_product->>'name'),category_id=v_category_id,
      type=nullif(btrim(p_product->>'type'),''),sterile=coalesce((p_product->>'sterile')::boolean,false),
      size=nullif(btrim(p_product->>'size'),''),grammage=nullif(btrim(p_product->>'grammage'),''),
      nf_description=v_nf_description,
      nf_description_source=case when v_nf_description is null then null
        else coalesce(v_nf_source,nf_description_source) end
    where id=v_product_id and tenant_id=v_tenant_id;
    if not found then raise exception 'Produto não encontrado'; end if;
    delete from public.product_components where product_id=v_product_id;
  end if;
  insert into public.product_components(tenant_id,product_id,component_input_id,component_product_id,quantity_type,quantity,width,length,yield_rate,lot_size,computed_quantity)
  select v_tenant_id,v_product_id,x.component_input_id,x.component_product_id,x.quantity_type::public.quantity_type,x.quantity,x.width,x.length,x.yield_rate,x.lot_size,x.computed_quantity
  from jsonb_to_recordset(p_components) x(component_input_id uuid,component_product_id uuid,quantity_type text,quantity numeric,width numeric,length numeric,yield_rate numeric,lot_size numeric,computed_quantity numeric);
  perform public.recalculate_product_costs(); return v_product_id;
end $$;

revoke execute on function public.save_product_with_components(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_product_with_components(uuid,jsonb,jsonb) to authenticated;
