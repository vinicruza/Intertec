import { Decimal } from "./decimal";
import { precoSemImposto } from "./inputs";
import { resolverQuantidade } from "./cmv";
import { calcularCMVsEmCascata, type InsumoCascata, type ProdutoCascata } from "./cascade";
import { ErroCalculoBloqueante } from "./types";

// ============================================================
// Ficha técnica de UM produto, com a participação % de cada componente
// (PRD §6.3). Reaproveita o cálculo em cascata para resolver componentes
// que são outros produtos (kits).
// ============================================================

export type LinhaFicha = {
  tipo: "insumo" | "produto";
  refId: string; // id do insumo ou do produto-componente
  custoUnitario: Decimal; // preço sem imposto (insumo) ou CMV (produto)
  quantidade: Decimal;
  custo: Decimal; // custoUnitario × quantidade
  participacao: Decimal; // fração do CMV do produto (soma 1,0)
};

export type FichaCalculada = {
  cmv: Decimal;
  linhas: LinhaFicha[];
};

// Calcula a ficha do produto `produtoId`. Precisa da lista de insumos (para o
// preço sem imposto) e de todos os produtos (para resolver kits em cascata).
export function calcularFicha(
  produtoId: string,
  insumos: InsumoCascata[],
  produtos: ProdutoCascata[]
): FichaCalculada {
  const alvo = produtos.find((p) => p.id === produtoId);
  if (!alvo) throw new ErroCalculoBloqueante(`Produto "${produtoId}" sem ficha técnica.`);

  // CMVs de todos os produtos (barra ciclos) e preço sem imposto dos insumos.
  const cmvs = calcularCMVsEmCascata(insumos, produtos);
  const precoSemPorInsumo = new Map<string, Decimal>();
  for (const i of insumos) {
    precoSemPorInsumo.set(i.id, precoSemImposto(i.precoComImposto, i.icms, i.pisCofins));
  }

  const cmv = cmvs.get(produtoId) ?? new Decimal(0);
  const linhas: LinhaFicha[] = alvo.componentes.map((c) => {
    const quantidade = resolverQuantidade(c.quantidade);
    const custoUnitario =
      c.tipo === "insumo"
        ? precoSemPorInsumo.get(c.insumoId) ?? new Decimal(0)
        : cmvs.get(c.produtoId) ?? new Decimal(0);
    const custo = custoUnitario.times(quantidade);
    return {
      tipo: c.tipo,
      refId: c.tipo === "insumo" ? c.insumoId : c.produtoId,
      custoUnitario,
      quantidade,
      custo,
      participacao: cmv.isZero() ? new Decimal(0) : custo.div(cmv),
    };
  });

  return { cmv, linhas };
}
