import { describe, expect, it } from "vitest";
import { dec, pctSobre, toPercent } from "@calc";
import { simular, statusMargem, statusMargemPedido, type RegraMargem } from "../../app/lib/sim/params";
import { montarDashboard } from "../../app/lib/sim/dashboard";
import { montarDRE, variacaoPercentual } from "../../app/lib/sim/dre";

// ============================================================
// Regressão — receita líquida zero ou negativa (Decisão D2)
// ============================================================
//
// Bug encontrado na varredura: todo percentual do sistema é calculado sobre a
// receita líquida, mas a receita líquida pode ser NEGATIVA (pedido pequeno com
// frete alto, por exemplo). Dividir um prejuízo por uma base negativa devolve
// um percentual POSITIVO — e o pedido aparecia como "Boa" (verde), fora da
// contagem de críticos do dashboard.
//
// É a classe de erro que o PRD §12 (critério 4) manda extinguir por design.
// Estes testes existem para que ela nunca volte.

const REGRAS: RegraMargem[] = [
  { label: "Boa", min_rate: "0.40", max_rate: null, color: "verde", sort_order: 1 },
  { label: "Atenção", min_rate: "0.25", max_rate: "0.40", color: "ambar", sort_order: 2 },
  { label: "Crítica", min_rate: "0.10", max_rate: "0.25", color: "laranja", sort_order: 3 },
  { label: "Negativa", min_rate: null, max_rate: "0.10", color: "vermelho", sort_order: 4 },
];

// Pedido de R$ 1.000 com frete de R$ 2.000 pago pela empresa (UF BA).
// Receita líquida −1.647,50 e margem de contribuição −2.147,50.
function pedidoComPrejuizo() {
  return simular({
    itens: [{ nome: "Avental", precoVenda: "10", quantidade: "100", cmvUnitario: "5", despesaUnitaria: "1" }],
    freteManual: "2000",
    fretePorContaCliente: false,
    comissao: null,
    canal: { aplicaDifal: true, comissaoPadrao: "0.025", modeloFrete: "manual" },
    uf: { aliquotaIcsm: "0.1625", difalFinal: "0.135", fretePortalPct: null },
  });
}

describe("pctSobre — sinal do percentual acompanha o valor, nunca a base", () => {
  it("base positiva: comporta-se como uma divisão normal", () => {
    expect(pctSobre(dec("4069.08"), dec("10219.50"))!.toFixed(4)).toBe("0.3982");
  });

  it("base negativa: prejuízo continua negativo (não inverte o sinal)", () => {
    expect(pctSobre(dec("-2147.5"), dec("-1647.5"))!.isNegative()).toBe(true);
  });

  it("base zero: devolve null em vez de Infinity", () => {
    expect(pctSobre(dec("100"), dec("0"))).toBeNull();
  });
});

describe("simulador com receita líquida negativa", () => {
  it("a margem de contribuição negativa produz percentual negativo", () => {
    const { resultado } = pedidoComPrejuizo();

    expect(resultado.receitaLiquida.toString()).toBe("-1647.5");
    expect(resultado.margemContribuicao.toString()).toBe("-2147.5");
    // Antes da correção este número saía +130,35% e pintava a faixa de verde.
    expect(toPercent(resultado.margemContribuicaoPct)).toBe("-130.35");
    expect(resultado.margemContribuicaoPct.isNegative()).toBe(true);
    expect(resultado.resultadoAposRateioPct.isNegative()).toBe(true);
  });

  it("o pedido cai na faixa Negativa, não na Boa", () => {
    const { resultado } = pedidoComPrejuizo();
    expect(statusMargem(resultado.margemContribuicaoPct, REGRAS)?.label).toBe("Negativa");
  });

  it("a simulação avisa que a receita líquida não é positiva", () => {
    const s = pedidoComPrejuizo();
    expect(s.resultado.receitaLiquidaNaoPositiva).toBe(true);
    expect(s.avisos.some((a) => /receita líquida zero ou negativa/i.test(a))).toBe(true);
  });

  it("pedido saudável continua sem o aviso e com percentual positivo", () => {
    const s = simular({
      itens: [{ nome: "Avental", precoVenda: "10", quantidade: "100", cmvUnitario: "2", despesaUnitaria: "1" }],
      freteManual: "50",
      fretePorContaCliente: false,
      comissao: null,
      canal: { aplicaDifal: false, comissaoPadrao: "0.025", modeloFrete: "manual" },
      uf: { aliquotaIcsm: "0.1625", difalFinal: "0", fretePortalPct: null },
    });
    expect(s.resultado.receitaLiquidaNaoPositiva).toBe(false);
    expect(s.resultado.margemContribuicaoPct.isPositive()).toBe(true);
    expect(s.avisos.some((a) => /receita líquida zero ou negativa/i.test(a))).toBe(false);
  });
});

describe("classificação de pedidos fechados (histórico)", () => {
  it("prejuízo com receita líquida negativa é classificado como Negativa", () => {
    expect(statusMargemPedido("-1500", "-1000", REGRAS)?.label).toBe("Negativa");
  });

  it("pedido saudável mantém a faixa correta", () => {
    expect(statusMargemPedido("4069.08", "10219.50", REGRAS)?.label).toBe("Atenção");
  });

  it("snapshot ausente não classifica (sem chute)", () => {
    expect(statusMargemPedido(null, "1000", REGRAS)).toBeNull();
    expect(statusMargemPedido("100", null, REGRAS)).toBeNull();
    expect(statusMargemPedido("100", "0", REGRAS)).toBeNull();
  });
});

describe("dashboard com pedido de receita líquida negativa", () => {
  const pedidoRuim = {
    net_revenue_snapshot: "-1000",
    gross_revenue_snapshot: "1000",
    contribution_margin_snapshot: "-1500",
    clienteId: "c1",
    cliente: "Cliente X",
    vendedorId: "v1",
    vendedor: "Vendedor",
  };

  it("conta o pedido como crítico/negativo", () => {
    const d = montarDashboard([pedidoRuim], [], REGRAS);
    expect(d.cards.pedidosCriticosOuNegativos).toBe(1);
  });

  it("a margem média do período não fica positiva", () => {
    const d = montarDashboard([pedidoRuim], [], REGRAS);
    expect(d.cards.margemMediaPct!.isNegative()).toBe(true);
  });
});

describe("DRE com receita líquida negativa", () => {
  it("os percentuais das linhas não invertem o sinal", () => {
    const dre = montarDRE(
      [
        {
          gross_revenue_snapshot: "1000",
          tax_snapshot: "1500",
          freight_tax_snapshot: "0",
          difal_snapshot: "500",
          commission_amount_snapshot: "25",
          cmv_total_snapshot: "500",
          expense_total_snapshot: "100",
          contribution_margin_snapshot: "-1525",
          vendedor: "V",
          canal: "C",
        },
      ],
      null
    );
    expect(dre.receitaLiquida.valor.isNegative()).toBe(true);
    expect(dre.margemContribuicao.valor.isNegative()).toBe(true);
    // O percentual da margem tem de continuar negativo.
    expect(dre.margemContribuicao.pct!.isNegative()).toBe(true);
  });
});

describe("variação entre meses no DRE", () => {
  it("prejuízo que diminui é melhora, não piora", () => {
    // Resultado operacional de −1.000 para −500: melhorou 50%.
    expect(toPercent(variacaoPercentual(dec("-500"), dec("-1000"))!)).toBe("50.00");
  });

  it("prejuízo que aumenta é piora", () => {
    expect(variacaoPercentual(dec("-1500"), dec("-1000"))!.isNegative()).toBe(true);
  });

  it("crescimento normal entre meses positivos", () => {
    expect(toPercent(variacaoPercentual(dec("1500"), dec("1000"))!)).toBe("50.00");
  });

  it("mês anterior zerado ou ausente não gera variação", () => {
    expect(variacaoPercentual(dec("100"), dec("0"))).toBeNull();
    expect(variacaoPercentual(dec("100"), null)).toBeNull();
  });
});
