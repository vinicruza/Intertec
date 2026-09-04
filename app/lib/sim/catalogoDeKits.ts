import type { Perfil } from "../roles";

// ============================================================
// Kit no catálogo: quem tira de circulação, e o que isso causa
// (pedido da Patricia, 04/09/2026)
// ============================================================
//
// Módulo puro, sem banco e sem tela, porque a mesma regra é escrita duas
// vezes: aqui, para a tela esconder o botão de quem não pode, e no banco
// (`set_kit_status`), que é quem de fato recusa. As duas precisam dizer a
// mesma coisa, e só uma delas dá para testar sem subir Postgres.

// Tirar um kit do catálogo muda o que a equipe INTEIRA consegue vender, então
// é decisão de catálogo, não de venda. O Comercial continua podendo criar kit
// (é o que ele faz ao montar um pedido) — o que ele não faz é aposentar um.
export function podeInativarKit(perfil: Perfil | null | undefined): boolean {
  return perfil === "admin" || perfil === "financeiro";
}

// ---------- O aviso antes de inativar ----------
//
// Um kit inativo sai da lista de itens vendáveis do simulador. Para pedido
// FECHADO isso não tem efeito nenhum: ele guarda nome, código e custo
// congelados (Decisão D7), e nada nele é recalculado.
//
// Para ORÇAMENTO EM ABERTO tem: quando alguém reabrir aquela cotação, a linha
// do kit volta com o item em branco, porque o item não está mais na lista de
// onde a tela lê.
//
// "Em aberto" exclui a cotação cancelada — quem conta é o banco
// (`get_kits_audit`), e o número chega aqui pronto. A distinção não é
// acadêmica: dos quatro kits inativados à mão em 04/09/2026, um (KC0028)
// estava numa cotação em 'simulation' que havia sido CANCELADA. Avisar sobre
// ela seria assustar com um papel que ninguém vai reabrir.
//
// Por isso o aviso fala do número de orçamentos em aberto e de mais nada: é a
// única consequência que exige uma ação de quem está decidindo.
export function avisoAoInativarKit(entrada: { orcamentosEmAberto: number }): string | null {
  const abertos = entrada.orcamentosEmAberto;
  if (abertos <= 0) return null;
  return abertos === 1
    ? "Atenção: 1 orçamento em aberto usa este kit. Ao inativar, a linha dele volta em branco quando essa cotação for reaberta — troque o item nela antes, ou reative o kit."
    : `Atenção: ${abertos} orçamentos em aberto usam este kit. Ao inativar, a linha dele volta em branco quando essas cotações forem reabertas — troque o item nelas antes, ou reative o kit.`;
}

// O texto da confirmação. Inativar e reativar são a mesma porta nos dois
// sentidos, e o que muda de verdade entre elas é o que a pessoa precisa
// entender antes de clicar:
//
//   inativar → o kit some da lista de venda, mas NÃO é apagado: o código e a
//              composição continuam reservados, e o histórico não muda
//   reativar → o kit volta a aparecer para vender, com o mesmo código
export function confirmacaoDeStatusDoKit(entrada: {
  ativando: boolean;
  codigo: string | null;
  nome: string;
  orcamentosEmAberto: number;
}): string {
  const identificacao = `${entrada.codigo?.trim() || "sem código"} — ${entrada.nome}`;
  if (entrada.ativando) {
    return `Reativar o kit ${identificacao}? Ele volta a aparecer na lista de itens do pedido, com o mesmo código.`;
  }
  const aviso = avisoAoInativarKit({ orcamentosEmAberto: entrada.orcamentosEmAberto });
  return [
    `Inativar o kit ${identificacao}?`,
    "Ele deixa de aparecer na lista de itens do pedido. Nada é apagado: o código e a composição continuam reservados, os pedidos já feitos não mudam, e dá para reativar quando quiser.",
    aviso,
  ]
    .filter(Boolean)
    .join("\n\n");
}
