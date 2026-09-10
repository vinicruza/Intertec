-- Complemento da criação manual de categorias: a RPC roda como invoker e chama
-- o helper de slug; o usuário autenticado precisa ter execute nele também.

grant execute on function public.slugify_product_category(text) to authenticated;
