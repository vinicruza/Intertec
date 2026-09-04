-- Complemento da migração anterior: o comentário da função passa a dizer o que
-- o sistema entende por "orçamento em aberto".
--
-- Não é detalhe de redação. A conta olha `cancelled_at` desde a primeira
-- aplicação, e é o que separa um aviso útil de um susto: dos quatro kits
-- inativados à mão em 04/09/2026, o KC0028 estava numa cotação em 'simulation'
-- que havia sido CANCELADA (ORC-2026-0195). Sem a ressalva escrita junto da
-- função, o próximo a ler o código refaria a conta sem ela.
comment on function public.set_kit_status(uuid, boolean, text) is
  'Ativa ou inativa um kit no catalogo (Admin/Financeiro). Registra em audit_logs. Kit inativo nao pode ser vendido, mas mantem codigo e assinatura reservados. Orcamento em aberto = status simulation e cancelled_at null.';
