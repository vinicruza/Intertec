import type { Perfil } from "../roles";

// ============================================================
// Produto no catálogo: inativar, reativar, excluir (08/09/2026)
// ============================================================
//
// Pedido da Patricia: "pode liberar no acesso de administrador o cancelamento
// ou exclusão de produtos". São duas coisas diferentes, e tratá-las como uma
// só seria o caminho mais curto para alguém apagar um produto que está dentro
// de pedido fechado.
//
// Como no kit (04/09), a regra de verdade mora no banco — `set_product_status`
// e `delete_product` recusam por conta própria. Isto aqui é para a tela não
// oferecer o que vai ser recusado, e é o que dá para testar sem subir Postgres.

// Tirar de circulação é decisão de catálogo: muda o que a equipe inteira
// consegue vender. Mesma régua do kit.
export function podeInativarProduto(perfil: Perfil | null | undefined): boolean {
  return perfil === "admin" || perfil === "financeiro";
}

// Apagar é a única operação sem volta do sistema. Fica só com o Administrador
// — foi o que a Patricia pediu, e é o que o risco justifica.
export function podeExcluirProduto(perfil: Perfil | null | undefined): boolean {
  return perfil === "admin";
}

export type UsoDoProdutoResumo = {
  emPedidos: number;
  emKits: number;
  emFichas: number;
  emVendas: number;
  emDespesas: number;
};

// Onde o produto aparece hoje, em uma frase. É o que decide se o botão de
// excluir sequer faz sentido, e é o que a confirmação mostra antes de inativar.
export function ondeOProdutoEUsado(uso: UsoDoProdutoResumo): string[] {
  const partes: string[] = [];
  if (uso.emPedidos > 0) partes.push(`${uso.emPedidos} pedido(s)`);
  if (uso.emKits > 0) partes.push(`${uso.emKits} kit(s)`);
  if (uso.emFichas > 0) partes.push(`a ficha de ${uso.emFichas} outro(s) produto(s)`);
  if (uso.emVendas > 0) partes.push(`${uso.emVendas} venda(s) importada(s)`);
  if (uso.emDespesas > 0) partes.push(`${uso.emDespesas} rateio(s) de despesa`);
  return partes;
}

// Produto que já andou não se apaga: apagar levaria junto o passado que o
// menciona. Para esse existe inativar, que é reversível.
export function produtoPodeSerExcluido(uso: UsoDoProdutoResumo): boolean {
  return ondeOProdutoEUsado(uso).length === 0;
}

export function confirmacaoDeStatusDoProduto(entrada: {
  ativando: boolean;
  codigo: string | null;
  nome: string;
  uso: UsoDoProdutoResumo;
}): string {
  const identificacao = `${entrada.codigo?.trim() || "sem código"} — ${entrada.nome}`;
  if (entrada.ativando) {
    return `Reativar o produto ${identificacao}? Ele volta a aparecer na lista de itens do pedido e na montagem de kits.`;
  }

  const onde = ondeOProdutoEUsado(entrada.uso);
  return [
    `Inativar o produto ${identificacao}?`,
    "Ele deixa de aparecer na lista de itens do pedido e na montagem de kits. Nada é apagado: os pedidos e kits já feitos não mudam, e dá para reativar quando quiser.",
    // O kit é o caso que morde: um kit ATIVO cujo produto foi inativado
    // continua vendável, e o custo dele segue vindo desse produto. A tela tem
    // de dizer isso antes, não depois.
    entrada.uso.emKits > 0
      ? `Atenção: este produto está em ${entrada.uso.emKits} kit(s), que continuam à venda com ele dentro. Confira esses kits.`
      : null,
    onde.length > 0 ? `Hoje ele aparece em: ${onde.join(", ")}.` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function confirmacaoDeExclusaoDoProduto(entrada: {
  codigo: string | null;
  nome: string;
}): string {
  const identificacao = `${entrada.codigo?.trim() || "sem código"} — ${entrada.nome}`;
  return [
    `EXCLUIR o produto ${identificacao}?`,
    "Isto não tem volta: a linha do produto, a ficha técnica e o custo dele são apagados.",
    "Só é possível porque ele nunca foi usado em pedido, kit, ficha de outro produto, venda importada ou rateio de despesa. Se a intenção é só tirar de circulação, use Inativar.",
  ].join("\n\n");
}
