import { Decimal, dec } from "@calc";

// ============================================================
// DRE gerencial mensal (PRD §6.8 + Decisão D3)
// ============================================================
// Soma os SNAPSHOTS dos pedidos fechados no mês — custos do momento de cada
// venda, nunca recalculados. A despesa da última linha é a despesa fixa REAL
// do mês (digitada pelo Financeiro), NUNCA a soma dos rateios; a diferença
// entre as duas aparece como "variação de absorção".

export type PedidoParaDRE = {
  id?: string;
  gross_revenue_snapshot: string;
  tax_snapshot: string;
  freight_tax_snapshot: string;
  difal_snapshot: string;
  commission_amount_snapshot: string;
  cmv_total_snapshot: string;
  expense_total_snapshot: string;
  contribution_margin_snapshot: string;
  vendedorId?: string;
  vendedor: string;
  canalId?: string;
  canal: string;
  clienteId?: string;
  cliente?: string;
  sinal?: 1 | -1;
};

export type ItemParaDRE = {
  id: string;
  orderId: string;
  tipo: "produto" | "kit";
  nome: string;
  categoria: string;
  quantidade: string;
  precoUnitario: string;
  cmvUnitario: string;
  sinal?: 1 | -1;
};

export type AberturaDRE = {
  id: string;
  nome: string;
  receitaBruta: Decimal;
  margemContribuicao: Decimal;
};

export type LinhaDRE = {
  valor: Decimal;
  pct: Decimal | null; // fração sobre a receita líquida (D2); null na receita bruta
};

export type DRE = {
  pedidos: number;
  cancelamentos: number;
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
    porVendedor: AberturaDRE[];
    porCanal: AberturaDRE[];
    porCliente: AberturaDRE[];
    porCategoria: AberturaDRE[];
    porItem: AberturaDRE[];
  };
};

const ZERO = new Decimal(0);

export function montarDRE(pedidos: PedidoParaDRE[], despesaFixaReal: string | null, itens: ItemParaDRE[] = []): DRE {
  const soma = (f: (p: PedidoParaDRE) => string) =>
    pedidos.reduce((s, p) => s.plus(dec(f(p)).times(p.sinal ?? 1)), ZERO);

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

  const agrupar = (identidade: (p: PedidoParaDRE) => { id: string; nome: string }) => {
    const grupos = new Map<string, AberturaDRE>();
    for (const p of pedidos) {
      const k = identidade(p);
      const g = grupos.get(k.id) ?? { id: k.id, nome: k.nome, receitaBruta: ZERO, margemContribuicao: ZERO };
      grupos.set(k.id, {
        id: g.id,
        nome: g.nome,
        receitaBruta: g.receitaBruta.plus(dec(p.gross_revenue_snapshot).times(p.sinal ?? 1)),
        margemContribuicao: g.margemContribuicao.plus(dec(p.contribution_margin_snapshot).times(p.sinal ?? 1)),
      });
    }
    return [...grupos.entries()]
      .map(([, v]) => v)
      .sort((a, b) => b.receitaBruta.comparedTo(a.receitaBruta));
  };

  const pedidoPorId = new Map(pedidos.filter((p) => p.id).map((p) => [p.id!, p]));
  const agruparItens = (identidade: (i: ItemParaDRE) => { id: string; nome: string }) => {
    const grupos = new Map<string, AberturaDRE>();
    for (const item of itens) {
      const pedido = pedidoPorId.get(item.orderId);
      if (!pedido) continue;
      const sinal = item.sinal ?? 1;
      const brutoItemBase = dec(item.precoUnitario).times(dec(item.quantidade));
      const cmvItemBase = dec(item.cmvUnitario).times(dec(item.quantidade));
      const brutoPedido = dec(pedido.gross_revenue_snapshot);
      // Impostos, frete e comissão são do pedido. Para a abertura por item,
      // rateamos esse bloco pela participação na receita e preservamos o CMV exato.
      const deducoesSemCmv = brutoPedido
        .minus(dec(pedido.contribution_margin_snapshot))
        .minus(dec(pedido.cmv_total_snapshot));
      const margemItemBase = brutoItemBase.minus(cmvItemBase).minus(
        brutoPedido.isZero() ? ZERO : deducoesSemCmv.times(brutoItemBase.div(brutoPedido))
      );
      const brutoItem = brutoItemBase.times(sinal);
      const margemItem = margemItemBase.times(sinal);
      const k = identidade(item);
      const g = grupos.get(k.id) ?? { id: k.id, nome: k.nome, receitaBruta: ZERO, margemContribuicao: ZERO };
      grupos.set(k.id, {
        id: g.id,
        nome: g.nome,
        receitaBruta: g.receitaBruta.plus(brutoItem),
        margemContribuicao: g.margemContribuicao.plus(margemItem),
      });
    }
    return [...grupos.values()].sort((a, b) => b.receitaBruta.comparedTo(a.receitaBruta));
  };

  return {
    pedidos: pedidos.filter((p) => (p.sinal ?? 1) === 1).length,
    cancelamentos: pedidos.filter((p) => p.sinal === -1).length,
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
      porVendedor: agrupar((p) => ({ id: p.vendedorId ?? p.vendedor, nome: p.vendedor })),
      porCanal: agrupar((p) => ({ id: p.canalId ?? p.canal, nome: p.canal })),
      porCliente: agrupar((p) => ({ id: p.clienteId ?? p.cliente ?? "sem-cliente", nome: p.cliente ?? "—" })),
      porCategoria: agruparItens((i) => ({ id: i.categoria, nome: i.categoria })),
      porItem: agruparItens((i) => ({ id: `${i.tipo}:${i.id}`, nome: i.nome })),
    },
  };
}
