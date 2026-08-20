-- "Aumente total_digits" era a única mensagem de erro do banco que ainda
-- despejava nome de coluna na tela de quem usa o sistema. Trocada pelo nome do
-- campo como ele aparece na tela de configurações.
--
-- Levantamento de 19/08/2026: varri todas as mensagens de `raise exception` das
-- funções e esta foi a única com jargão. As demais já eram frases em português.

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'generate_erp_codes' and p.prokind = 'f'
   limit 1;

  if v_def is null then return; end if;

  execute replace(
    v_def,
    'Aumente total_digits.',
    'Aumente o total de dígitos nas configurações de código do ERP.'
  );
end $$;
