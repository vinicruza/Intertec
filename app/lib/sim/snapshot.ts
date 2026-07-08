import { Decimal, dec, toMoney, type EntradaDecimal } from "@calc";
import type { Simulacao } from "./params";

// ============================================================
// Snapshot de fechamento (Decisão D7)
// ============================================================
// Ao fechar, o pedido congela: CMV e despesa unitários de cada item, alíquotas
// aplicadas, comissão, frete e a composição do kit EXPANDIDA. Valores em
// precisão total; os totais também vão arredondados a 2 casas em
// `totals_display` (PRD §8). Pedido fechado nunca é recalculado.

export type ItemParaSnapshot = {
  orderItemId: string;
  precoVenda: EntradaDecimal;
  quantidade: EntradaDecimal;
  cmvUnitario: EntradaDecimal;
  despesaUnitaria: EntradaDecimal;
  // Composição expandida no momento da venda (só para kits):
  composicaoKit: Array<{ produtoId: string; nome: string; quantidade: string; cmvUnitario: string }> | null;
};

export type SnapshotPedido = {
  pedido: {
    gross_revenue_snapshot: string;
    tax_snapshot: string;
    freight_tax_snapshot: string;
    difal_snapshot: string;
    commission_amount_snapshot: string;
    net_revenue_snapshot: string;
    cmv_total_snapshot: string;
    expense_total_snapshot: string;
    contribution_margin_snapshot: string;
    result_after_allocation_snapshot: string;
    totals_display: Record<string, string>;
  };
  itens: Array<{
    orderItemId: string;
    cmv_unit_snapshot: string;
    expense_unit_snapshot: string;
    tax_rate_snapshot: string;
    difal_rate_snapshot: string;
    commission_rate_snapshot: string;
    freight_share_snapshot: string;
    kit_composition_snapshot: unknown | null;
  }>;
};

export function montarSnapshot(
  simulacao: Simulacao,
  aliquotaIcsm: EntradaDecimal,
  itens: ItemParaSnapshot[]
): SnapshotPedido {
  const r = simulacao.resultado;
  const receitaBruta = r.receitaBruta;

  const itensSnapshot = itens.map((item) => {
    const receitaItem = dec(item.precoVenda).times(dec(item.quantidade));
    // Frete rateado por item, proporcional à participação na receita.
    const freteShare = receitaBruta.isZero()
      ? new Decimal(0)
      : simulacao.freteUsado.times(receitaItem.div(receitaBruta));
    return {
      orderItemId: item.orderItemId,
      cmv_unit_snapshot: dec(item.cmvUnitario).toString(),
      expense_unit_snapshot: dec(item.despesaUnitaria).toString(),
      tax_rate_snapshot: dec(aliquotaIcsm).toString(),
      difal_rate_snapshot: simulacao.difalAplicado.toString(),
      commission_rate_snapshot: simulacao.comissaoUsada.toString(),
      freight_share_snapshot: freteShare.toString(),
      kit_composition_snapshot: item.composicaoKit,
    };
  });

  return {
    pedido: {
      gross_revenue_snapshot: r.receitaBruta.toString(),
      tax_snapshot: r.imposto.toString(),
      freight_tax_snapshot: r.impostoFrete.toString(),
      difal_snapshot: r.difal.toString(),
      commission_amount_snapshot: r.comissao.toString(),
      net_revenue_snapshot: r.receitaLiquida.toString(),
      cmv_total_snapshot: r.cmvTotal.toString(),
      expense_total_snapshot: r.despesaTotal.toString(),
      contribution_margin_snapshot: r.margemContribuicao.toString(),
      result_after_allocation_snapshot: r.resultadoAposRateio.toString(),
      totals_display: {
        receita_bruta: toMoney(r.receitaBruta),
        impostos: toMoney(r.imposto),
        imposto_frete: toMoney(r.impostoFrete),
        difal: toMoney(r.difal),
        comissao: toMoney(r.comissao),
        frete: toMoney(simulacao.freteUsado),
        receita_liquida: toMoney(r.receitaLiquida),
        cmv: toMoney(r.cmvTotal),
        despesa_alocada: toMoney(r.despesaTotal),
        margem_contribuicao: toMoney(r.margemContribuicao),
        resultado_apos_rateio: toMoney(r.resultadoAposRateio),
      },
    },
    itens: itensSnapshot,
  };
}
