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
  tributarFreteInformado?: boolean; // frete cliente destacado: não deduz frete, mas tributa
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
  frete: Decimal;             // o que de fato saiu do resultado (0 se o cliente paga)
  freteInformado: Decimal;    // o que foi digitado/calculado, antes da regra acima
  impostoFrete: Decimal;
  imposto: Decimal;           // imposto sobre a receita (ICSM)
  baseDifal: Decimal;         // receita + frete informado — a memória de cálculo do DIFAL
  difal: Decimal;
  baseComissao: Decimal;      // receita + frete informado — a memória de cálculo da comissão
  comissao: Decimal;
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
//   base_com_frete   = receita_pedido + frete_informado
//   DIFAL            = aliquota_difal × base_com_frete
//   comissao         = aliquota_comissao × base_com_frete
//   frete            = 0, se o frete é por conta do cliente (e então imposto_frete = 0)
//   receita_liquida  = receita − frete − imposto_frete − imposto − DIFAL − comissao
//   margem_contrib.  = receita_liquida − CMV_pedido      ← métrica oficial (= 39,67% no fixture)
//   result_rateio    = margem_contribuicao − despesa_pedido  ← informativo (= 9,11% no fixture)
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

  // Frete por conta do cliente: o valor do frete não reduz a margem porque é
  // repassado ao cliente fora da venda dos itens. Quando o frete está
  // destacado, porém, a planilha oficial mantém o imposto sobre esse frete em
  // linha própria.
  //
  // Antes daqui saía um "ajuste_frete = −frete" que era SOMADO a uma conta que
  // já tinha subtraído o frete: ele saía duas vezes, e um frete alto derrubava
  // a receita líquida para baixo de zero. Era o que o Calculations.md §6
  // descrevia, copiado da planilha; a própria linha se contradizia, dizendo
  // entre parênteses que o cliente devolve o frete. Corrigido em 04/08/2026.
  const freteInformado = dec(p.frete);
  const frete = p.fretePorContaCliente ? zero : freteInformado;
  const baseImpostoFrete = p.tributarFreteInformado ? freteInformado : frete;

  const aliquotaImposto = dec(p.aliquotaImposto);
  const impostoFrete = aliquotaImposto.times(baseImpostoFrete);
  const imposto = aliquotaImposto.times(receitaBruta);

  // Base de receita + FRETE INFORMADO — usada pela COMISSÃO e pelo DIFAL.
  //
  // Comissão: confirmado pelo cliente em 18/08/2026.
  // DIFAL: confirmado pelo cliente em 18/08/2026, na mesma direção.
  //
  // Por que os dois e o ICMS não. O imposto sobre venda (ICSM) já alcança o
  // frete, mas por outro caminho: a linha "Imposto sobre frete", separada, que
  // aplica a mesma alíquota sobre o frete. Somando as duas linhas, o ICMS já
  // incide sobre receita + frete. O DIFAL não tem linha própria de frete — daí
  // somar o frete na base ser exatamente como tributá-lo. O resultado final é
  // o mesmo tratamento para os dois impostos, escrito de duas formas.
  //
  // Usa o frete INFORMADO, não o efetivo: mesmo quando o cliente paga o frete
  // (e a dedução vai a zero), o transporte foi vendido — o vendedor comissiona
  // sobre ele e o estado cobra sobre ele. É o que a planilha faz: a fórmula
  // aponta para a célula do frete digitado, não para a linha já líquida de
  // estorno. Golden tests T16b e T17b.
  const baseComFrete = receitaBruta.plus(freteInformado);

  // Expostos com nomes próprios: são duas linhas distintas da cascata, cada uma
  // com a sua memória de cálculo na tela. Hoje a base é a mesma; se um dia uma
  // delas mudar, muda sozinha.
  const baseComissao = baseComFrete;
  const baseDifal = baseComFrete;

  const difal = dec(p.aliquotaDifal).times(baseDifal);
  const comissao = dec(p.aliquotaComissao).times(baseComissao);

  const receitaLiquida = receitaBruta
    .minus(frete)
    .minus(impostoFrete)
    .minus(imposto)
    .minus(difal)
    .minus(comissao);

  const margemContribuicao = receitaLiquida.minus(cmvTotal);
  const resultadoAposRateio = margemContribuicao.minus(despesaTotal);

  return {
    receitaBruta,
    cmvTotal,
    despesaTotal,
    frete,
    freteInformado,
    impostoFrete,
    imposto,
    baseDifal,
    difal,
    baseComissao,
    comissao,
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
