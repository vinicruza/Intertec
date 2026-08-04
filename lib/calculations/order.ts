import { Decimal, dec } from "./decimal";
import { ErroCalculoBloqueante, type EntradaDecimal } from "./types";

// ============================================================
// Camada 4 — Simulação de pedido (Calculations.md §6 + Decisão D1)
// ============================================================

export type ItemPedido = {
  nome: string;
  precoVenda: EntradaDecimal;
  quantidade: EntradaDecimal;
  cmvUnitario: EntradaDecimal;      // CMV vigente do produto/kit (Camada 2)
  despesaUnitaria: EntradaDecimal;  // despesa rateada por unidade (Camada 3)
};

export type ParametrosPedido = {
  itens: ItemPedido[];
  frete: EntradaDecimal;
  fretePorContaCliente?: boolean;   // flag "Frete Cliente": cliente paga o frete
  aliquotaImposto: EntradaDecimal;  // ICSM total da UF de destino (ex.: 0,1625 = 16,25%)
  aliquotaDifal: EntradaDecimal;    // DIFAL da UF; 0 se o canal não aplica ou UF interna
  aliquotaComissao: EntradaDecimal; // padrão do canal (ex.: 0,025 = 2,5%)
};

// A cascata de margem em 4 níveis (Decisão D1) — a mesma estrutura de DRE
// exibida em todo o sistema. Cada número tem um nome preciso.
export type ResultadoPedido = {
  receitaBruta: Decimal;
  cmvTotal: Decimal;
  despesaTotal: Decimal;      // informativo (só entra no último nível)
  frete: Decimal;
  impostoFrete: Decimal;
  imposto: Decimal;           // imposto sobre a receita (ICSM)
  difal: Decimal;
  comissao: Decimal;
  ajusteFrete: Decimal;       // −frete quando o cliente paga
  receitaLiquida: Decimal;    // receita menos frete, impostos, DIFAL e comissão
  // Nível oficial: MARGEM DE CONTRIBUIÇÃO (dispara os alertas de status)
  margemContribuicao: Decimal;
  margemContribuicaoPct: Decimal;
  // Nível informativo: resultado após descontar também a despesa rateada
  resultadoAposRateio: Decimal;
  resultadoAposRateioPct: Decimal;
  itens: ResultadoItem[];
};

export type ResultadoItem = {
  nome: string;
  receita: Decimal;
  cmvTotal: Decimal;
  despesaTotal: Decimal;
};

//   receita_pedido   = Σ (preco_venda × quantidade)
//   imposto_frete    = aliquota_imposto × frete
//   imposto          = aliquota_imposto × receita_pedido
//   DIFAL            = aliquota_difal × receita_pedido
//   comissao         = aliquota_comissao × receita_pedido
//   ajuste_frete     = −frete, se o cliente paga
//   receita_liquida  = receita − frete − imposto_frete − imposto − DIFAL − comissao + ajuste_frete
//   margem_contrib.  = receita_liquida − CMV_pedido      ← métrica oficial (= 39,82% no fixture)
//   result_rateio    = margem_contribuicao − despesa_pedido  ← informativo (= 9,33% no fixture)
//
// Golden tests T6 (BA) e T7 (SP). A validação de CMV=0 é o T9.
export function calcularPedido(p: ParametrosPedido): ResultadoPedido {
  if (p.itens.length === 0) {
    throw new ErroCalculoBloqueante("Pedido sem itens — nada a calcular.");
  }

  // Validação bloqueante (PRD §7 / T9): CMV zerado ou ausente nunca passa em
  // silêncio. Na planilha isso virava custo zero mudo por erro de nome (bug §9).
  for (const item of p.itens) {
    if (dec(item.cmvUnitario).lte(0)) {
      throw new ErroCalculoBloqueante(
        `Item "${item.nome}": CMV zerado ou ausente. Verifique a ficha técnica do produto — ` +
          `custo zero é bloqueante, nunca aceito em silêncio.`
      );
    }
  }

  const itens: ResultadoItem[] = p.itens.map((i) => {
    const quantidade = dec(i.quantidade);
    return {
      nome: i.nome,
      receita: dec(i.precoVenda).times(quantidade),
      cmvTotal: dec(i.cmvUnitario).times(quantidade),
      despesaTotal: dec(i.despesaUnitaria).times(quantidade),
    };
  });

  const zero = new Decimal(0);
  const receitaBruta = itens.reduce((s, i) => s.plus(i.receita), zero);
  const cmvTotal = itens.reduce((s, i) => s.plus(i.cmvTotal), zero);
  const despesaTotal = itens.reduce((s, i) => s.plus(i.despesaTotal), zero);

  const frete = dec(p.frete);
  const aliquotaImposto = dec(p.aliquotaImposto);
  const impostoFrete = aliquotaImposto.times(frete);
  const imposto = aliquotaImposto.times(receitaBruta);
  const difal = dec(p.aliquotaDifal).times(receitaBruta);
  const comissao = dec(p.aliquotaComissao).times(receitaBruta);
  const ajusteFrete = p.fretePorContaCliente ? frete.negated() : zero;

  const receitaLiquida = receitaBruta
    .minus(frete)
    .minus(impostoFrete)
    .minus(imposto)
    .minus(difal)
    .minus(comissao)
    .plus(ajusteFrete);

  const margemContribuicao = receitaLiquida.minus(cmvTotal);
  const resultadoAposRateio = margemContribuicao.minus(despesaTotal);

  return {
    receitaBruta,
    cmvTotal,
    despesaTotal,
    frete,
    impostoFrete,
    imposto,
    difal,
    comissao,
    ajusteFrete,
    receitaLiquida,
    margemContribuicao,
    margemContribuicaoPct: margemPct(margemContribuicao, receitaLiquida),
    resultadoAposRateio,
    resultadoAposRateioPct: margemPct(resultadoAposRateio, receitaLiquida),
    itens,
  };
}

// Percentual de margem sobre a receita líquida.
//
// Divide pelo MÓDULO da receita líquida de propósito. Quando um pedido afunda a
// receita líquida para baixo de zero (frete e impostos maiores que a venda), a
// margem também fica negativa — e dividir negativo por negativo devolvia um
// percentual POSITIVO. Um prejuízo de R$ 320,85 aparecia como +147,52% e o
// sistema carimbava o pedido como "Boa", em verde, no simulador e na fila de
// aprovação.
//
// Usando o módulo no denominador, o sinal do percentual é sempre o sinal do
// dinheiro: prejuízo é sempre negativo, e cai na faixa "Negativa". Pedido com
// receita líquida positiva — o caso normal, e o dos golden tests T6/T7 — não
// muda em nada.
export function margemPct(margem: Decimal, receitaLiquida: Decimal): Decimal {
  if (receitaLiquida.isZero()) return new Decimal(0);
  return margem.div(receitaLiquida.abs());
}
