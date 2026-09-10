-- Aviso de canal na ficha impressa (pedido da Patricia, 10/09/2026)
--
-- A Descpro fatura pedidos vendidos por este canal, e a ficha impressa não diz
-- isso em lugar nenhum: quem confere na mesa não tem como saber, olhando o
-- papel, que aquele pedido é da Descpro e não da Intertech Surgical.
--
-- Vinicius foi claro sobre o escopo: não é preciso levar o CNPJ nem endereço
-- da Descpro para a ficha (ainda) — só um aviso visível. Por isso o campo é um
-- texto solto por canal, e não uma tabela de empresa emissora: se amanhã outro
-- canal precisar do mesmo aviso, é dado, não migração nova. Nulo em todo canal
-- que não precisa de aviso, inclusive nos futuros — a ficha só imprime a linha
-- quando o campo vem preenchido.
alter table public.channels
  add column if not exists rotulo_ficha text;

comment on column public.channels.rotulo_ficha is
  'Texto impresso na ficha do pedido, abaixo da logo da Intertech, quando o pedido é deste canal. Nulo = nada impresso.';

update public.channels
   set rotulo_ficha = 'Descpro'
 where name = 'Descpro';
