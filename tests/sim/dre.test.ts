import { describe, expect, it } from "vitest";
import { Decimal, toMoney } from "@calc";
import { montarDRE, type ItemParaDRE, type PedidoParaDRE } from "../../app/lib/sim/dre";

// Critério de aceite da Sprint 12: o DRE de um mês bate com a CONFERÊNCIA
// MANUAL. Dois pedidos fechados com valores conferíveis à mão:
//
// Pedido 1 — fixture Patricia (BA):    Pedido 2 — Revendas (sem DIFAL):
//   receita 16.800 | impostos 2.730      receita 10.000 | impostos 1.625
//   DIFAL 2.268 | comissão 420           DIFAL 0 | comissão 250
//   frete 1.000 + imp. frete 162,50      frete 0
//   CMV 6.150,42 | rateio 3.115,132      CMV 4.000 | rateio 1.000
//   margem contribuição 4.069,08         margem contribuição 4.125
const PEDIDOS: PedidoParaDRE[] = [
  {
    id: "o1",
    gross_revenue_snapshot: "16800",
    tax_snapshot: "2730",
    freight_tax_snapshot: "162.50",
    difal_snapshot: "2268",
    commission_amount_snapshot: "420",
    cmv_total_snapshot: "6150.42",
    expense_total_snapshot: "3115.132",
    contribution_margin_snapshot: "4069.08",
    vendedor: "Patricia",
    canal: "Interno",
    clienteId: "c1",
    cliente: "Hospital Central",
  },
  {
    id: "o2",
    gross_revenue_snapshot: "10000",
    tax_snapshot: "1625",
    freight_tax_snapshot: "0",
    difal_snapshot: "0",
    commission_amount_snapshot: "250",
    cmv_total_snapshot: "4000",
    expense_total_snapshot: "1000",
    contribution_margin_snapshot: "4125",
    vendedor: "Revendas",
    canal: "Revendas",
    clienteId: "c2",
    cliente: "Clínica Sul",
  },
];

const ITENS: ItemParaDRE[] = [
  { id: "p1", orderId: "o1", tipo: "produto", nome: "Avental", categoria: "Vestuário", quantidade: "100", precoUnitario: "168", cmvUnitario: "61.5042" },
  { id: "k1", orderId: "o2", tipo: "kit", nome: "[Kit] Básico", categoria: "Kit", quantidade: "10", precoUnitario: "1000", cmvUnitario: "400" },
];

describe("DRE mensal — conferência manual", () => {
  const dre = montarDRE(PEDIDOS, "7000"); // despesa fixa REAL do mês

  it("cada linha bate com a soma feita à mão", () => {
    expect(toMoney(dre.receitaBruta.valor)).toBe("26800.00");           // 16.800 + 10.000
    expect(toMoney(dre.impostosEDifal.valor)).toBe("6623.00");          // 4.355 + 2.268
    expect(toMoney(dre.receitaLiquida.valor)).toBe("20177.00");         // 26.800 − 6.623
    expect(toMoney(dre.cmv.valor)).toBe("10150.42");                    // 6.150,42 + 4.000
    expect(toMoney(dre.lucroBruto.valor)).toBe("10026.58");             // 20.177 − 10.150,42
    expect(toMoney(dre.margemContribuicao.valor)).toBe("8194.08");      // 4.069,08 + 4.125
    // Frete líquido + comissões = lucro bruto − margem de contribuição
    // conferência: frete 1.000 + imposto frete 162,50 + comissões 670 = 1.832,50 ✓
    expect(toMoney(dre.freteEComissoes.valor)).toBe("1832.50");
    expect(toMoney(dre.resultadoOperacional!.valor)).toBe("1194.08");   // 8.194,08 − 7.000
  });

  it("variação de absorção = Σ rateios − despesa real (nunca soma rateios como despesa)", () => {
    expect(toMoney(dre.somaRateios)).toBe("4115.13");                   // 3.115,132 + 1.000
    expect(toMoney(dre.variacaoAbsorcao!)).toBe("-2884.87");            // 4.115,13 − 7.000
  });

  it("percentuais sobre a receita líquida (D2)", () => {
    // Margem de contribuição: 8.194,08 ÷ 20.177 = 40,61%
    expect(dre.margemContribuicao.pct!.times(100).toFixed(2)).toBe("40.61");
  });

  it("aberturas por vendedor e canal", () => {
    expect(dre.aberturas.porVendedor.map((v) => v.nome)).toEqual(["Patricia", "Revendas"]);
    expect(toMoney(dre.aberturas.porVendedor[0].margemContribuicao)).toBe("4069.08");
    expect(dre.aberturas.porCanal.find((c) => c.nome === "Revendas")!.receitaBruta.toString()).toBe("10000");
  });

  it("sem despesa real informada: DRE para na margem de contribuição", () => {
    const semReal = montarDRE(PEDIDOS, null);
    expect(semReal.despesaFixaReal).toBeNull();
    expect(semReal.resultadoOperacional).toBeNull();
    expect(semReal.variacaoAbsorcao).toBeNull();
  });

  it("abre por cliente, categoria e item sem perder a margem total", () => {
    const detalhada = montarDRE(PEDIDOS, "7000", ITENS);
    expect(detalhada.aberturas.porCliente.map((x) => x.nome)).toEqual(["Hospital Central", "Clínica Sul"]);
    expect(detalhada.aberturas.porCategoria.map((x) => x.nome)).toEqual(["Vestuário", "Kit"]);
    const margemItens = detalhada.aberturas.porItem.reduce((s, x) => s.plus(x.margemContribuicao), new Decimal(0));
    expect(toMoney(margemItens)).toBe(toMoney(detalhada.margemContribuicao.valor));
  });
});
