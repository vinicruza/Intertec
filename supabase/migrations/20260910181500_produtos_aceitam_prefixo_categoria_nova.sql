-- Categorias de produto agora podem ser criadas pela tela de Cadastros.
-- A trava antiga de código continuava presa na lista histórica de prefixos,
-- então um produto de categoria nova era gerado corretamente pelo trigger e
-- recusado logo depois por `products_semantic_code`.

alter table public.products
  drop constraint if exists products_semantic_code;

alter table public.products
  add constraint products_semantic_code
  check (code ~ '^[A-Z][A-Z0-9]{1,2}[0-9]{4,}$');

comment on constraint products_semantic_code on public.products is
  'Código semântico: prefixo da categoria, com 2 a 3 caracteres alfanuméricos começando por letra, seguido da sequência numérica.';
