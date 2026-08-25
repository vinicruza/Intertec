import { describe, expect, it } from "vitest";
import { simular } from "../../app/lib/sim/params";
import { montarSnapshot } from "../../app/lib/sim/snapshot";

// Snapshot do fechamento (D7) sobre o fixture Patricia: precisão total nas
// colunas e 2 casas em totals_display; frete rateado por item; composição
// de kit expandida preservada.
describe("snapshot de fechamento — fixture Patricia", () => {
  const s = simular({
    itens: [
      { nome: "Avental TNT NE", precoVenda: "4.20", quantidade: "4000", cmvUnitario: "1.537605", despesaUnitaria: "0.778783" },
    ],
    freteManual: "1000",
    fretePorContaCliente: false,
    comissao: null,
    canal: { aplicaDifal: true, comissaoPadrao: "0.025", modeloFrete: "manual" },
    uf: { aliquotaIcsm: "0.1625", difalFinal: "0.135", fretePortalPct: null },
  });

  const composicao = [
    { produtoId: "p1", nome: "Avental", quantidade: "2", cmvUnitario: "1.537605" },
  ];

  const snap = montarSnapshot(s, "0.1625", [
    {
      orderItemId: "item-1",
      precoVenda: "4.20",
      quantidade: "4000",
      cmvUnitario: "1.537605",
      despesaUnitaria: "0.778783",
      composicaoKit: composicao,
    },
  ]);

  // Valores de 21/08/2026: com o frete desmarcado, os R$ 1.000 do transporte
  // saem do resultado e NÃO são tributados — a regra do Bryan (golden T14c).
  // Antes eram 11.222,00 de receita líquida e 5.071,58 de margem.
  it("congela os totais em precisão total e o display a 2 casas", () => {
    expect(snap.pedido.net_revenue_snapshot).toBe("10222");
    expect(snap.pedido.totals_display.receita_liquida).toBe("10222.00");
    expect(snap.pedido.totals_display.margem_contribuicao).toBe("4071.58");
    expect(snap.pedido.totals_display.cmv).toBe("6150.42");
    expect(snap.pedido.totals_display.difal).toBe("2403.00");
  });

  it("congela alíquotas, comissão e frete rateado por item", () => {
    const item = snap.itens[0];
    expect(item.cmv_unit_snapshot).toBe("1.537605");
    expect(item.tax_rate_snapshot).toBe("0.1625");
    expect(item.difal_rate_snapshot).toBe("0.135");
    expect(item.commission_rate_snapshot).toBe("0.025");
    // Único item → 100% do frete
    expect(item.freight_share_snapshot).toBe("1000");
  });

  it("preserva a composição expandida do kit", () => {
    expect(snap.itens[0].kit_composition_snapshot).toEqual(composicao);
  });

  it("rateia o frete proporcionalmente à receita quando há vários itens", () => {
    const s2 = simular({
      itens: [
        { nome: "A", precoVenda: "10", quantidade: "100", cmvUnitario: "1", despesaUnitaria: "0" }, // receita 1000 (25%)
        { nome: "B", precoVenda: "30", quantidade: "100", cmvUnitario: "1", despesaUnitaria: "0" }, // receita 3000 (75%)
      ],
      freteManual: "200",
      fretePorContaCliente: false,
      comissao: null,
      canal: { aplicaDifal: false, comissaoPadrao: "0.025", modeloFrete: "manual" },
      uf: { aliquotaIcsm: "0.1625", difalFinal: "0", fretePortalPct: null },
    });
    const snap2 = montarSnapshot(s2, "0.1625", [
      { orderItemId: "a", precoVenda: "10", quantidade: "100", cmvUnitario: "1", despesaUnitaria: "0", composicaoKit: null },
      { orderItemId: "b", precoVenda: "30", quantidade: "100", cmvUnitario: "1", despesaUnitaria: "0", composicaoKit: null },
    ]);
    expect(snap2.itens[0].freight_share_snapshot).toBe("50");  // 25% de 200
    expect(snap2.itens[1].freight_share_snapshot).toBe("150"); // 75% de 200
  });
});

// A tela do pedido (PedidoDetalhePage) e a ficha impressa (PedidoFichaPage)
// listam as deduções uma a uma e imprimem a receita líquida logo abaixo. Se
// alguma linha não for exibida, o leitor não consegue fechar a conta — foi o
// que aconteceu até 25/08/2026, quando a tela mostrava só imposto e DIFAL e
// R$ 62,88 de imposto do frete + comissão sumiam sem explicação.
//
// Este teste guarda o contrato que a exibição usa: as SEIS deduções gravadas
// em totals_display somam exatamente a receita bruta menos a líquida.
describe("totals_display fecha a cascata", () => {
  const casos = [
    { nome: "frete pago pela Intertech", fretePorContaCliente: false },
    { nome: "frete por conta do cliente", fretePorContaCliente: true },
  ];

  for (const caso of casos) {
    it(`as seis deduções reconciliam com a receita líquida — ${caso.nome}`, () => {
      const s = simular({
        itens: [
          { nome: "Avental TNT NE", precoVenda: "4.20", quantidade: "4000", cmvUnitario: "1.537605", despesaUnitaria: "0.778783" },
        ],
        freteManual: "1000",
        fretePorContaCliente: caso.fretePorContaCliente,
        comissao: null,
        canal: { aplicaDifal: true, comissaoPadrao: "0.025", modeloFrete: "manual" },
        uf: { aliquotaIcsm: "0.1625", difalFinal: "0.135", fretePortalPct: null },
      });
      const t = montarSnapshot(s, "0.1625", [
        {
          orderItemId: "item-1",
          precoVenda: "4.20",
          quantidade: "4000",
          cmvUnitario: "1.537605",
          despesaUnitaria: "0.778783",
          composicaoKit: [],
        },
      ]).pedido.totals_display;

      const num = (v: string) => Number(v);
      // Frete DEDUZIDO: o cotado (t.frete) continua na base do DIFAL e da
      // comissão, mas não sai da receita quando quem paga é o cliente.
      const deducoes = num(t.frete_deduzido) + num(t.imposto_frete) + num(t.impostos) + num(t.difal) + num(t.comissao);

      expect(num(t.receita_bruta) - deducoes).toBeCloseTo(num(t.receita_liquida), 2);
      // E a margem é a líquida menos o CMV, que é a última linha da cascata.
      expect(num(t.receita_liquida) - num(t.cmv)).toBeCloseTo(num(t.margem_contribuicao), 2);
    });
  }
});
