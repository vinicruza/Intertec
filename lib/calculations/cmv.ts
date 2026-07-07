import { Decimal, dec } from "./decimal";
import type { EntradaDecimal } from "./types";

// ============================================================
// Camada 2 — Ficha técnica e CMV (Calculations.md §3 e §4)
// ============================================================

// A quantidade consumida de cada componente é guardada como EXPRESSÃO
// ESTRUTURADA, não só o número final — senão ninguém saberá de onde veio
// "1,212121" daqui a um ano (Calculations.md §3).
export type Quantidade =
  // Número simples (ex.: 1 bag por unidade)
  | { tipo: "direta"; quantidade: EntradaDecimal }
  // Área com perda: largura × comprimento ÷ rendimento (ex.: 1 × 1,2 ÷ 0,99)
  | { tipo: "area"; largura: EntradaDecimal; comprimento: EntradaDecimal; rendimento: EntradaDecimal }
  // Rateio por lote: 1 ÷ tamanho do lote (ex.: 1 caixa serve 150 unidades)
  | { tipo: "lote"; tamanhoLote: EntradaDecimal };

// Converte a expressão estruturada no número de fato consumido.
export function resolverQuantidade(q: Quantidade): Decimal {
  switch (q.tipo) {
    case "direta":
      return dec(q.quantidade);
    case "area":
      return dec(q.largura).times(dec(q.comprimento)).div(dec(q.rendimento));
    case "lote":
      return new Decimal(1).div(dec(q.tamanhoLote));
  }
}

// Um componente da ficha. O custo unitário é o preço sem imposto do insumo
// (Camada 1) OU o CMV de outro produto — é assim que os kits funcionam em
// cascata (Calculations.md §4): o "custo unitário" de um Produto-componente
// é simplesmente o CMV desse produto. Nada no cálculo muda.
export type ComponenteFicha = {
  nome: string;
  custoUnitario: EntradaDecimal;
  quantidade: Quantidade;
};

export type LinhaCMV = {
  nome: string;
  quantidade: Decimal;
  custo: Decimal;
  participacao: Decimal; // fração do CMV total (ex.: 0,28 = 28%)
};

export type ResultadoCMV = {
  cmv: Decimal;
  componentes: LinhaCMV[];
};

//   custo_componente = preco_sem_imposto × quantidade_consumida
//   CMV_produto      = Σ custo_componente
//   participacao_%   = custo_componente ÷ CMV_produto
//
// Golden test T3. Também é a base do recálculo em cascata de kits (T8, Sprint 6):
// como um Produto-componente entra apenas como mais um custo unitário, recalcular
// o CMV de um insumo e depois o do kit reflete a mudança automaticamente.
export function calcularCMV(componentes: ComponenteFicha[]): ResultadoCMV {
  const linhas = componentes.map((c) => {
    const quantidade = resolverQuantidade(c.quantidade);
    return { nome: c.nome, quantidade, custo: dec(c.custoUnitario).times(quantidade) };
  });

  const cmv = linhas.reduce((soma, l) => soma.plus(l.custo), new Decimal(0));

  return {
    cmv,
    componentes: linhas.map((l) => ({
      ...l,
      participacao: cmv.isZero() ? new Decimal(0) : l.custo.div(cmv),
    })),
  };
}
