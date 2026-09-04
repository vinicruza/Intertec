-- REGISTRO DE MIGRAÇÃO APLICADA DIRETO NO BANCO (02/09/2026, 19h44).
-- Transcrita de `supabase_migrations.schema_migrations`, sem alteração.
--
-- A trava de "pelo menos uma cotação de frete" (Calculations.md §15) passa a
-- aceitar a linha ESCOLHIDA cuja transportadora é de retirada, mesmo sem
-- valor: quando o cliente retira, não existe frete para cotar.

create or replace function public.tem_cotacao_de_frete(p_quotes jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_item jsonb;
  v_texto text;
  v_carrier text;
begin
  if p_quotes is null or jsonb_typeof(p_quotes) <> 'array' then return false; end if;

  for v_item in select value from jsonb_array_elements(p_quotes)
  loop
    v_carrier := nullif(btrim(coalesce(v_item->>'carrierId','')),'');
    if v_carrier is null
       and nullif(btrim(coalesce(v_item->>'carrierOther','')),'') is null then
      continue;
    end if;

    if (v_item->'selected') = to_jsonb(true)
       and v_carrier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and exists (
         select 1 from public.carriers c
          where c.id = v_carrier::uuid and c.is_pickup
       ) then
      return true;
    end if;

    v_texto := btrim(coalesce(v_item->>'amount',''));
    if position(',' in v_texto) > 0 then
      v_texto := replace(replace(v_texto, '.', ''), ',', '.');
    end if;
    if v_texto ~ '^-?[0-9]+([.][0-9]+)?$' and v_texto::numeric > 0 then
      return true;
    end if;
  end loop;

  return false;
end $$;

revoke execute on function public.tem_cotacao_de_frete(jsonb) from public, anon;
grant execute on function public.tem_cotacao_de_frete(jsonb) to authenticated;
