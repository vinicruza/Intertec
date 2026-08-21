-- ============================================================
-- Ficha do pedido mostra QUEM aprovou, não só quando
-- Pedido da Intertech em 21/08/2026 (rastreabilidade).
-- ============================================================
--
-- `orders.approved_by` já aponta para `profiles(id)`, mas a política
-- `profiles_select` deixa cada pessoa ler só o PRÓPRIO perfil (fora admin do
-- tenant). Então a vendedora que abre a ficha não enxerga o nome de quem
-- aprovou — o embed do PostgREST volta nulo, sem erro nenhum.
--
-- Em vez de abrir `profiles` inteira (que carrega papel e e-mail de todo
-- mundo), esta função devolve SÓ o nome, e só dentro do mesmo tenant.
create or replace function public.nome_do_usuario(p_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select p.full_name
    from public.profiles p
   where p.id = p_id
     and p.tenant_id = public.current_tenant_id()
     and public.current_user_role() is not null;
$$;

revoke execute on function public.nome_do_usuario(uuid) from public, anon;
grant execute on function public.nome_do_usuario(uuid) to authenticated;
