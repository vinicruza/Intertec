-- ============================================================
-- O banco recusa a aprovação automática abaixo do selo
-- ============================================================
--
-- Fecha o caso de 01/09/2026 pela última ponta. Até aqui havia três camadas:
--
--   1. a regra corrigida (eac6fbd) — impede ESTE erro;
--   2. os testes golden — impedem alguém mexer na régua do TypeScript;
--   3. a contagem na Integridade (a8e1ce2) — ACUSA se acontecer de novo.
--
-- Todas as três chegam depois do fato ou dependem de alguém olhar. A prova
-- definitiva seria um teste que escreve num banco de verdade e confere que o
-- pedido de 41% não foi aprovado sozinho — e isso exige banco separado, que é
-- pago e a Intertech decidiu não ter.
--
-- Então em vez de DETECTAR o estado ruim, o banco passa a RECUSÁ-LO. É mais
-- forte que o teste que não teremos: um teste diz que o código estava certo no
-- dia em que rodou; esta trava vale em toda gravação, venha de onde vier —
-- gatilho, função de fechamento, correção manual no banco, ou código que ainda
-- não foi escrito.
--
-- ---------- O que exatamente é recusado ----------
--
-- Só a combinação que causou o problema: aprovação AUTOMÁTICA (a nota diz isso)
-- em pedido cujo selo é vermelho ou amarelo.
--
-- Aprovação HUMANA de margem baixa continua passando. Um administrador pode
-- aprovar o que quiser — é para isso que a fila existe, e travar isso seria
-- trocar um erro por outro.
--
-- Linha que JÁ estava nesse estado também passa. Sem essa ressalva, editar a
-- expedição de um dos três pedidos antigos pararia por causa de um erro que já
-- aconteceu, e a trava viraria estorvo em vez de proteção.
create or replace function public.impede_aprovacao_automatica_abaixo_do_selo()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_pct numeric;
  v_selo text;
begin
  if new.approval_status <> 'aprovado' then return new; end if;
  if coalesce(new.approval_notes,'') not ilike 'Aprovado automaticamente pela margem%' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.approval_status = 'aprovado'
     and coalesce(old.approval_notes,'') ilike 'Aprovado automaticamente pela margem%' then
    return new;
  end if;

  if coalesce(new.net_revenue_snapshot, 0) = 0 then return new; end if;
  v_pct := new.contribution_margin_snapshot / new.net_revenue_snapshot;
  v_selo := public.selo_comercial_do_pedido(new.id, v_pct);

  if v_selo in ('red','yellow') then
    raise exception
      'Aprovacao automatica recusada: margem de % por cento cai na faixa %, que exige aprovacao humana.',
      round(v_pct*100, 2), v_selo;
  end if;

  return new;
end $$;

drop trigger if exists trg_orders_aprovacao_automatica_valida on public.orders;
create trigger trg_orders_aprovacao_automatica_valida
before update on public.orders
for each row execute function public.impede_aprovacao_automatica_abaixo_do_selo();

revoke execute on function public.impede_aprovacao_automatica_abaixo_do_selo() from public, anon, authenticated;
