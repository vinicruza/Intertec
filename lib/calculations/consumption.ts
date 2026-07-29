import { Decimal, dec } from "./decimal";
import { resolverQuantidade } from "./cmv";
import type { ComponenteRef } from "./cascade";
import { ErroCalculoBloqueante, type EntradaDecimal } from "./types";

// ============================================================
// Explosão de consumo (reunião Intertech 16/07/2026)
// ============================================================
//
// A pergunta que isto responde, feita várias vezes na reunião:
//
//   "quanto que a gente vendeu de produtos com gramatura, TNT azul, 30 gramas?"
//   "o que a gente está vendendo de laminado?"
//
// O problema apontado é real: o laminado não tem código próprio, é um tecido
// que está dentro de vários produtos. Não dá para responder olhando o código
// do produto vendido — é preciso descer a ficha técnica até o insumo.
//
// Aqui a venda é explodida: para cada produto ou kit vendido, percorre-se a
// composição em cascata somando a quantidade consumida de cada insumo,
// ponderada pela quantidade vendida.

export type ProdutoComposicao = {
  id: string;
  componentes: ComponenteRef[];
};

export type VendaParaExplosao = {
  // Produto ou kit vendido. Kits são produtos compostos, o cálculo é o mesmo.
  produtoId: string;
  quantidade: EntradaDecimal;
};

export type ConsumoInsumo = {
  insumoId: string;
  quantidade: Decimal;
};

// Explode as vendas até os insumos. Devolve a quantidade consumida de cada um.
//
// Referência circular é erro bloqueante, como no cálculo de CMV — um ciclo
// aqui produziria consumo infinito.
export function explodirConsumo(
  vendas: VendaParaExplosao[],
  produtos: ProdutoComposicao[]
): Map<string, Decimal> {
  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));

  // Consumo unitário de insumos por produto, memoizado: um produto vendido
  // 4.000 vezes não precisa ser explodido 4.000 vezes.
  const consumoUnitario = new Map<string, Map<string, Decimal>>();
  const emCalculo = new Set<string>();

  function consumoDe(produtoId: string): Map<string, Decimal> {
    const memo = consumoUnitario.get(produtoId);
    if (memo) return memo;
    if (emCalculo.has(produtoId)) {
      throw new ErroCalculoBloqueante(
        `Referência circular na composição envolvendo o produto "${produtoId}".`
      );
    }
    const produto = produtoPorId.get(produtoId);
    if (!produto) {
      throw new ErroCalculoBloqueante(`Produto "${produtoId}" sem ficha técnica.`);
    }

    emCalculo.add(produtoId);
    const total = new Map<string, Decimal>();
    for (const c of produto.componentes) {
      const quantidade = resolverQuantidade(c.quantidade);
      if (c.tipo === "insumo") {
        somar(total, c.insumoId, quantidade);
      } else {
        // Produto-componente: leva junto tudo que ele consome, na proporção.
        for (const [insumoId, qtd] of consumoDe(c.produtoId)) {
          somar(total, insumoId, qtd.times(quantidade));
        }
      }
    }
    emCalculo.delete(produtoId);

    consumoUnitario.set(produtoId, total);
    return total;
  }

  const consumo = new Map<string, Decimal>();
  for (const venda of vendas) {
    const vendida = dec(venda.quantidade);
    if (vendida.lte(0)) continue;
    for (const [insumoId, qtdUnitaria] of consumoDe(venda.produtoId)) {
      somar(consumo, insumoId, qtdUnitaria.times(vendida));
    }
  }
  return consumo;
}

function somar(mapa: Map<string, Decimal>, chave: string, valor: Decimal): void {
  mapa.set(chave, (mapa.get(chave) ?? new Decimal(0)).plus(valor));
}

// Consumo ordenado do maior para o menor, que é como a leitura é feita: "o que
// mais consumimos no mês".
export function consumoOrdenado(consumo: Map<string, Decimal>): ConsumoInsumo[] {
  return [...consumo.entries()]
    .map(([insumoId, quantidade]) => ({ insumoId, quantidade }))
    .sort((a, b) => b.quantidade.comparedTo(a.quantidade));
}
