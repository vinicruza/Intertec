import { Decimal, dec } from "./decimal";
import { ErroCalculoBloqueante, type EntradaDecimal } from "./types";

// ============================================================
// Assinatura única de kit (PRD §6.5 + golden test T10)
// ============================================================
//
// A assinatura identifica uma composição: os mesmos produtos nas mesmas
// quantidades geram SEMPRE a mesma assinatura, independentemente da ordem
// em que foram adicionados. Formato: "id:qtd|id:qtd", ordenado pelo id.
// Ao salvar, se a assinatura já existe, o sistema oferece reutilizar o kit
// existente em vez de duplicar (dedupe).

export type ItemKit = {
  produtoId: string;
  quantidade: EntradaDecimal;
};

export function assinaturaKit(itens: ItemKit[]): string {
  if (itens.length === 0) {
    throw new ErroCalculoBloqueante("Kit sem itens não tem assinatura.");
  }

  // Consolida itens repetidos do mesmo produto (2 + 3 do produto X = 5 de X).
  const porProduto = new Map<string, Decimal>();
  for (const item of itens) {
    const qtd = dec(item.quantidade);
    if (qtd.lte(0)) {
      throw new ErroCalculoBloqueante(`Quantidade inválida para o produto "${item.produtoId}".`);
    }
    porProduto.set(item.produtoId, (porProduto.get(item.produtoId) ?? new Decimal(0)).plus(qtd));
  }

  return [...porProduto.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    // toString() do Decimal é canônico: "2", "2.5" — nunca "2.0"
    .map(([id, qtd]) => `${id}:${qtd.toString()}`)
    .join("|");
}

// Custo do kit = soma ponderada dos componentes (Calculations.md §4):
// recebe o custo unitário vigente de cada produto (CMV ou despesa unitária).
export function custoKit(
  itens: ItemKit[],
  custoUnitarioPorProduto: Map<string, EntradaDecimal>
): Decimal {
  return itens.reduce((soma, item) => {
    const custo = custoUnitarioPorProduto.get(item.produtoId);
    if (custo === undefined) {
      throw new ErroCalculoBloqueante(
        `Produto "${item.produtoId}" sem custo vigente — kit não pode ser calculado (nunca zero silencioso).`
      );
    }
    return soma.plus(dec(custo).times(dec(item.quantidade)));
  }, new Decimal(0));
}
