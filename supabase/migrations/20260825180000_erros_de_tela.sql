-- ============================================================
-- Registrar o erro que a pessoa VÊ, sem inundar os alertas
-- ============================================================
--
-- Até 25/08/2026 só três coisas registravam erro: quebra de tela, promessa não
-- tratada e falha da consulta de CNPJ. Erro que o código TRATA e mostra na tela
-- não deixava rastro — e foi assim que um "invalid input syntax for type
-- integer" chegou a uma vendedora, virou print no WhatsApp e nunca apareceu na
-- tela de Monitoramento. Quinze dias sem um único erro registrado num sistema
-- em uso diário não era sorte: era cegueira.
--
-- Passar a registrar esses erros esbarra na classificação. A regra atual marca
-- como CRÍTICO tudo o que acontece em /simulador, /pedidos, /clientes e afins —
-- desenhada para quebra de tela, onde o caminho realmente diz a gravidade. Com
-- erro tratado entrando pelo mesmo cano, toda recusa de regra de negócio
-- ("Pedido já fechado", "Cotação sem itens") viraria alerta crítico, e o alerta
-- que grita por tudo deixa de ser lido.
--
-- A separação é por ORIGEM, não por caminho:
--
--   origem = 'tela'  → a pessoa viu uma mensagem e pôde seguir. Baixo, a menos
--                      que o texto denuncie vazamento técnico — SQL cru,
--                      TypeError, permissão negada. Aí é defeito nosso: alto.
--   demais origens   → regra de antes, intacta.
create or replace function public.classify_client_error(p_path text, p_message text, p_context jsonb default '{}'::jsonb)
returns text
language plpgsql
immutable
set search_path=public,pg_temp
as $$
declare
  v_path text := coalesce(p_path,'/');
  v_message text := lower(coalesce(p_message,''));
  v_origin text := lower(coalesce(p_context->>'origem',''));
begin
  -- Erro tratado, que a pessoa leu na tela e conseguiu seguir.
  if v_origin = 'tela' then
    -- Texto de máquina chegando ao usuário é defeito, não regra de negócio:
    -- ou falta tradução, ou o campo aceitou o que não devia.
    if v_message like '%invalid input syntax%'
       or v_message like '%violates %constraint%'
       or v_message like '%null value in column%'
       or v_message like '%syntax error%'
       or v_message like '%permission denied%'
       or v_message like '%row-level security%'
       or v_message like '%typeerror%'
       or v_message like '%cannot read properties%'
       or v_message like '%undefined is not%'
    then
      return 'alto';
    end if;
    return 'baixo';
  end if;

  if v_path ~ '^/(login|simulador|clientes|pedidos|aprovacoes|dre)(/|$)'
     or v_message like '%cannot read properties of undefined%'
     or v_message like '%failed to fetch dynamically imported module%'
     or v_message like '%loading chunk%'
     or v_message like '%dynamically imported module%'
  then
    return 'critico';
  end if;

  if v_origin = 'unhandledrejection'
     or v_message like '%network%'
     or v_message like '%fetch%'
     or v_message like '%timeout%'
  then
    return 'alto';
  end if;

  return 'medio';
end $$;
