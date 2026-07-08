import { Decimal, dec } from "@calc";

// ============================================================
// DRE gerencial mensal (PRD §6.8 + Decisão D3)
// ============================================================
// Soma os SNAPSHOTS dos pedidos fechados no mês — custos do momento de cada
// venda, nunca recalculados. A despesa da última linha é a despesa fixa REAL
// do mês (digitada pelo Financeiro), NUNCA a soma dos rateios; a diferença
// entre as duas aparece como "variação de absorção".

export type PedidoParaDRE = {
  gross_revenue_snapshot: string;
  tax_snapshot: string;
  freight_tax_snapshot: string;
  difal_snapshot: string;
  commission_amount_snapshot: string;
  cmv_total_snapshot: string;
  expense_total_snapshot: string;
  contribution_margin_snapshot: string;
  vendedor: string;
  canal: string;
};

export type LinhaDRE = {
  valor: Decimal;
  pct: Decimal | null; // fração sobre a receita líquida (D2); null na receita bruta
};

export type DRE = {
  pedidos: number;
  receitaBruta: LinhaDRE;
  impostosEDifal: LinhaDRE;
  receitaLiquida: LinhaDRE;
  cmv: LinhaDRE;
  lucroBruto: LinhaDRE;
  freteEComissoes: LinhaDRE;
  margemContribuicao: LinhaDRE;
  despesaFixaReal: LinhaDRE | null; // null se o Financeiro ainda não informou
  resultadoOperacional: LinhaDRE | null;
  variacaoAbsorcao: Decimal | null; // Σ rateios − despesa real (informativo)
  somaRateios: Decimal;
  aberturas: {
    porVendedor: Array<{ nome: string; receitaBruta: Decimal; margemContribuicao: Decimal }>;
    porCanal: Array<{ nome: string; receitaBruta: Decimal; margemContribuicao: Decimal }>;
  };
};

const ZERO = new Decimal(0);

export function montarDRE(pedidos: PedidoParaDRE[], despesaFixaReal: string | null): DRE {
  const soma = (f: (p: PedidoParaDRE) => string) =>
    pedidos.reduce((s, p) => s.plus(dec(f(p))), ZERO);

  const receitaBruta = soma((p) => p.gross_revenue_snapshot);
  // Impostos sobre venda + DIFAL (o imposto sobre o frete entra na linha de frete).
  const impostosEDifal = soma((p) => p.tax_snapshot).plus(soma((p) => p.difal_snapshot));
  const receitaLiquida = receitaBruta.minus(impostosEDifal);
  const cmv = soma((p) => p.cmv_total_snapshot);
  const lucroBruto = receitaLiquida.minus(cmv);
  const margemContribuicao = soma((p) => p.contribution_margin_snapshot);
  // Frete líquido + comissões = o que separa o lucro bruto da margem de contribuição.
  const freteEComissoes = lucroBruto.minus(margemContribuicao);
  const somaRateios = soma((p) => p.expense_total_snapshot);

  const pct = (v: Decimal): Decimal | null =>
    receitaLiquida.isZero() ? null : v.div(receitaLiquida);

  const real = despesaFixaReal === null ? null : dec(despesaFixaReal);
  const resultadoOperacional = real === null ? null : margemContribuicao.minus(real);

  const agrupar = (chave: (p: PedidoParaDRE) => string) => {
    const grupos = new Map<string, { receitaBruta: Decimal; margemContribuicao: Decimal }>();
    for (const p of pedidos) {
      const k = chave(p);
      const g = grupos.get(k) ?? { receitaBruta: ZERO, margemContribuicao: ZERO };
      grupos.set(k, {
        receitaBruta: g.receitaBruta.plus(dec(p.gross_revenue_snapshot)),
        margemContribuicao: g.margemContribuicao.plus(dec(p.contribution_margin_snapshot)),
      });
    }
    return [...grupos.entries()]
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.receitaBruta.comparedTo(a.receitaBruta));
  };

  return {
    pedidos: pedidos.length,
    receitaBruta: { valor: receitaBruta, pct: null },
    impostosEDifal: { valor: impostosEDifal, pct: pct(impostosEDifal) },
    receitaLiquida: { valor: receitaLiquida, pct: pct(receitaLiquida) },
    cmv: { valor: cmv, pct: pct(cmv) },
    lucroBruto: { valor: lucroBruto, pct: pct(lucroBruto) },
    freteEComissoes: { valor: freteEComissoes, pct: pct(freteEComissoes) },
    margemContribuicao: { valor: margemContribuicao, pct: pct(margemContribuicao) },
    despesaFixaReal: real === null ? null : { valor: real, pct: pct(real) },
    resultadoOperacional:
      resultadoOperacional === null ? null : { valor: resultadoOperacional, pct: pct(resultadoOperacional) },
    variacaoAbsorcao: real === null ? null : somaRateios.minus(real),
    somaRateios,
    aberturas: {
      porVendedor: agrupar((p) => p.vendedor),
      porCanal: agrupar((p) => p.canal),
    },
  };
}
