# Monitoramento de Producao - Intertech

> Primeira leitura: 10/08/2026, com base no uso desde sexta-feira, 07/08/2026.

## Objetivo

Criar uma rotina curta de acompanhamento da Intertech em producao, olhando quatro frentes:

- uso real do sistema;
- erros de interface e bugs reportados;
- velocidade percebida e pontos de lentidao;
- pendencias operacionais que impedem o uso sem a planilha ao lado.

## Ambiente monitorado

- Producao: `https://intertec-lac.vercel.app`
- Supabase: `wdnontebtxnrsenvtucd`
- Projeto: Intertech CMV e Rentabilidade
- Regiao Supabase: `sa-east-1`

## Leitura inicial desde 07/08/2026

Resumo do banco:

| Indicador | Resultado |
|---|---:|
| Erros de interface registrados | 5 |
| Eventos de auditoria | 2 |
| Pedidos criados | 4 |
| Pedidos atualizados | 8 |
| Versoes de pedido criadas | 3 |
| Clientes criados | 4 |
| Perfis ativos | 11 |
| Perfis ativos com troca de senha pendente | 4 |

Depois do ultimo deploy de 07/08/2026 15:47:15 UTC:

| Indicador | Resultado |
|---|---:|
| Erros de interface registrados | 0 |
| Pedidos criados | 1 |
| Pedidos atualizados | 1 |
| Clientes criados | 3 |
| Versoes de pedido criadas | 1 |

## Achado tecnico principal

Os 5 erros registrados antes do ultimo deploy tinham a mesma mensagem:

`Cannot read properties of undefined (reading 'default')`

Rotas afetadas:

- `/simulador`
- `/clientes`
- `/perfil`
- `/aprovacoes`
- `/`

Usuarios impactados nos registros:

- Isabela
- Vinicius
- Michele

Leitura tecnica: o padrao parece falha de carregamento de chunk/lazy load apos deploy ou cache de versao no navegador. O projeto ja tem protecao em `app/lib/recarregarChunk.ts`, `app/main.tsx` e `app/ErrorBoundary.tsx`. Como nao houve novos erros apos o deploy de 07/08/2026 15:47:15 UTC, a prioridade agora e monitorar recorrencia, nao mexer as cegas.

## Uso observado

Usuarios com login recente no periodo de entrada em producao:

- Mari
- Natalia
- Michele
- Vinicius
- Isabela
- Patricia

Usuarios ativos ainda sem login/troca de senha concluida:

- Suelen
- Giovanna
- Cristiane
- Bryan

Fluxos com movimentacao desde sexta-feira:

- cadastro de clientes;
- simulacao/cotacao de pedidos;
- atualizacao de pedidos;
- criacao de versoes de pedido;
- marcacao de pedido como perdido;
- cancelamento de pedido.

## Alertas de performance do Supabase

O Advisor de performance apontou:

- chaves estrangeiras sem indice cobrindo algumas tabelas;
- politicas RLS permissivas duplicadas em algumas tabelas;
- indices ainda nao usados.

Leitura pratica: isso ainda nao prova lentidao percebida pelo usuario. Como o uso real ainda esta baixo, alguns indices aparecem como "nao usados" naturalmente. Prioridade imediata: acompanhar lentidao por tela e corrigir primeiro os pontos com impacto real no fluxo Comercial/Admin.

## Alertas de seguranca do Supabase

O Advisor de seguranca apontou:

- protecao contra senha vazada ainda desligada no Supabase Auth;
- funcoes `SECURITY DEFINER` executaveis por usuarios autenticados;
- `rls_auto_enable()` aparece como alerta do linter.

Leitura pratica: a protecao contra senha vazada deve ser ligada no painel. As funcoes `SECURITY DEFINER` precisam ser revisadas com cuidado, porque algumas sao intencionais para regras de permissao e gestao de usuarios. Nao alterar em lote sem validar funcao por funcao.

## Rotina diaria recomendada

Durante os primeiros 10 dias uteis de producao:

1. Consultar erros de interface do dia.
2. Conferir usuarios que acessaram e usuarios sem login.
3. Medir pedidos/clientes criados e atualizados.
4. Separar bug real de duvida de uso.
5. Classificar pendencias por impacto: Critico, Alto, Medio, Baixo.
6. Corrigir primeiro erros que travem Comercial, aprovacao, cadastro de cliente ou ficha do pedido.

## Consultas base

Erros recentes:

```sql
select
  ce.occurred_at,
  coalesce(p.full_name, 'sem usuario') as usuario,
  ce.path,
  ce.message,
  left(coalesce(ce.stack, ''), 350) as stack_inicio,
  ce.context
from client_errors ce
left join profiles p on p.id = ce.user_id
where ce.occurred_at >= now() - interval '24 hours'
order by ce.occurred_at desc;
```

Uso desde uma data:

```sql
with params as (
  select timestamptz '2026-08-07 00:00:00+00' as since
)
select 'client_errors' as metric, count(*)::text as value
from client_errors, params
where occurred_at >= since
union all
select 'audit_events', count(*)::text
from audit_logs, params
where created_at >= since
union all
select 'orders_created', count(*)::text
from orders, params
where created_at >= since
union all
select 'orders_updated', count(*)::text
from orders, params
where updated_at >= since
union all
select 'customers_created', count(*)::text
from customers, params
where created_at >= since;
```

Usuarios e login:

```sql
select
  p.full_name,
  p.role::text as perfil,
  p.active,
  p.must_change_password,
  u.email,
  u.last_sign_in_at,
  p.created_at
from profiles p
left join auth.users u on u.id = p.id
order by coalesce(u.last_sign_in_at, p.created_at) desc nulls last;
```

## Proximas melhorias de observabilidade

Sem depender de ferramentas externas:

- registrar medicao de tempo por rota/tela no front;
- registrar acoes funcionais concluidas, como `cliente_salvo` e `cotacao_salva`;
- criar uma tela interna simples de `Monitoramento` para Admin/Super Admin.

Base tecnica criada:

- tabela `monitoring_events`;
- funcao `log_monitoring_event`;
- registro automatico de `page_view`;
- registros funcionais iniciais de `cliente_salvo` e `cotacao_salva`.
- tela interna `/monitoramento`, visivel apenas para Super Admin.
- agrupamento automatico de erros em `client_error_groups`;
- classificacao de severidade: `critico`, `alto`, `medio`, `baixo`;
- fila de alerta em `client_error_alerts` para erro novo/critico;
- status operacional por grupo: `novo`, `em_analise`, `corrigido`, `ignorado`.

## Tratamento rapido de erros

A captura de erro continua salvando cada ocorrencia bruta em `client_errors`, mas agora tambem consolida por `fingerprint`.
O fingerprint considera tela normalizada, mensagem, trecho inicial da stack e versao de deploy quando disponivel.

Na pratica, a tela de Monitoramento passa a mostrar:

- quantas vezes o mesmo erro aconteceu;
- quando apareceu pela primeira e ultima vez;
- usuario e tela da ultima ocorrencia;
- severidade automatica;
- se existe alerta pendente;
- status de acompanhamento.

Regra de prioridade inicial:

- `critico`: erro em telas centrais (`/login`, `/simulador`, `/clientes`, `/pedidos`, `/aprovacoes`, `/dre`) ou falhas fortes de carregamento/chunk;
- `alto`: erro nao tratado de promessa, falha de rede, fetch ou timeout;
- `medio`: demais erros de interface;
- `baixo`: reservado para avisos sem impacto quando passarmos a capturar esse tipo de evento.

O alerta automatico no Telegram deve consumir a fila `client_error_alerts` e marcar `sent_at` apos envio. Enquanto o segredo do bot/chat nao estiver configurado, a propria tela mostra os alertas pendentes para acao manual.

Base de envio preparada:

- Edge Function `intertech-error-alerts`;
- secrets esperados: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` e, opcionalmente, `INTERTECH_ALERT_SECRET`;
- envia ate 5 alertas pendentes por execucao;
- apos envio, marca `client_error_alerts.sent_at` e limpa `client_error_groups.alert_needed`.
- erros historicos agrupados por backfill ficam visiveis na tela, mas nao entram como envio retroativo.

Com ferramentas externas:

- Sentry para stack traces, releases e agrupamento de erros;
- PostHog para uso por tela, funis e usuarios ativos.

## Status inicial

Status tecnico em 10/08/2026:

- Supabase ativo e saudavel.
- Producao respondendo HTTP 200.
- Teste externo do HTML inicial respondeu em aproximadamente 0,10s.
- Nenhum erro de interface registrado apos o ultimo deploy de 07/08/2026 15:47:15 UTC.
- Ponto de atencao operacional: 4 perfis ativos ainda com troca de senha pendente.
