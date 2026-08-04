import { Decimal, dec } from "./decimal";
import { ErroCalculoBloqueante, type EntradaDecimal } from "./types";

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
//
// Rendimento e tamanho de lote são DENOMINADORES. Zerados, o decimal.js não
// reclama: devolve Infinity em silêncio, o custo do componente vira Infinity, o
// CMV do produto vira Infinity, e a validação de pedido — que só barra CMV
// menor ou igual a zero — deixa passar, porque Infinity é maior que zero. Um
// campo digitado errado contaminaria a cascata inteira sem uma única mensagem.
// Barrar aqui é o mesmo princípio do custo zero: nada de errado passa calado.
export function resolverQuantidade(q: Quantidade): Decimal {
  switch (q.tipo) {
    case "direta":
      return dec(q.quantidade);
    case "area": {
      const rendimento = dec(q.rendimento);
      if (rendimento.lte(0)) {
        throw new ErroCalculoBloqueante(
          "Rendimento precisa ser maior que zero para calcular a quantidade por área (largura × comprimento ÷ rendimento)."
        );
      }
      return dec(q.largura).times(dec(q.comprimento)).div(rendimento);
    }
    case "lote": {
      const tamanhoLote = dec(q.tamanhoLote);
      if (tamanhoLote.lte(0)) {
        throw new ErroCalculoBloqueante(
          "Tamanho do lote precisa ser maior que zero — é ele que diz quantas unidades um item atende."
        );
      }
      return new Decimal(1).div(tamanhoLote);
    }
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
  // Marca o componente como MÃO DE OBRA (ex.: "Custo costureira avental M G").
  // Reunião Intertech 16/07/2026: o custo de costureira fica dentro do CMV do
  // produto, mas o DRE por competência precisa enxergar o CMV SEM ele, porque
  // se paga costureira referente à produção passada — vendem-se 30 mil aventais
  // no mês em que se pagou por 40 mil. O sistema entrega os dois números.
  maoDeObra?: boolean;
};

export type LinhaCMV = {
  nome: string;
  quantidade: Decimal;
  custo: Decimal;
  participacao: Decimal; // fração do CMV total (ex.: 0,28 = 28%)
  maoDeObra: boolean;
};

export type ResultadoCMV = {
  cmv: Decimal; // com mão de obra — é o CMV cheio, usado no pedido
  cmvSemMaoDeObra: Decimal; // para o DRE por competência
  custoMaoDeObra: Decimal; // a diferença, destacada
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
    return {
      nome: c.nome,
      quantidade,
      custo: dec(c.custoUnitario).times(quantidade),
      maoDeObra: c.maoDeObra === true,
    };
  });

  const cmv = linhas.reduce((soma, l) => soma.plus(l.custo), new Decimal(0));
  const custoMaoDeObra = linhas.reduce(
    (soma, l) => (l.maoDeObra ? soma.plus(l.custo) : soma),
    new Decimal(0)
  );

  return {
    cmv,
    cmvSemMaoDeObra: cmv.minus(custoMaoDeObra),
    custoMaoDeObra,
    componentes: linhas.map((l) => ({
      ...l,
      // A participação continua sendo sobre o CMV cheio: é a leitura de
      // "quanto este item pesa no custo", e a costureira pesa de verdade.
      participacao: cmv.isZero() ? new Decimal(0) : l.custo.div(cmv),
    })),
  };
}
