import { describe, expect, it } from "vitest";
import { ErroCalculoBloqueante, calcularCMV, calcularPedido, dec, margemPct } from "@calc";
import { seloMargemComercial, statusMargem, type RegraMargem } from "@app/lib/sim/params";

// Defeito encontrado em teste real (04/08/2026): um pedido com PREJUÍZO de
// R$ 320,85 aparecia com o selo verde "Boa". A margem era negativa, a receita
// líquida também, e negativo dividido por negativo devolvia +147,52% — que caí­a
// na faixa "Boa" (mínimo 40%, sem teto).
//
// Onde isso aparecia: cascata do simulador, selo da fila de Aprovações e a
// contagem "Crítica/negativa" do painel Início. Os três agora passam pela mesma
// função.

// As mesmas faixas da carga inicial (margin_rules).
const FAIXAS: RegraMargem[] = [
  { label: "Boa", min_rate: "0.40", max_rate: null, color: "green", sort_order: 1 },
  { label: "Atenção", min_rate: "0.25", max_rate: "0.40", color: "yellow", sort_order: 2 },
  { label: "Crítica", min_rate: "0.10", max_rate: "0.25", color: "orange", sort_order: 3 },
  { label: "Negativa", min_rate: null, max_rate: "0.10", color: "red", sort_order: 4 },
];

describe("percentual de margem", () => {
  it("prejuízo nunca vira percentual positivo", () => {
    // Os números exatos do pedido que o cliente montou na tela.
    const pct = margemPct(dec("-320.85"), dec("-217.50"));
    expect(pct.isNegative()).toBe(true);
    expect(pct.toFixed(4)).toBe("-1.4752");
  });

  it("prejuízo nunca é carimbado como margem Boa", () => {
    const pct = margemPct(dec("-320.85"), dec("-217.50"));
    expect(statusMargem(pct, FAIXAS)?.label).toBe("Negativa");
  });

  it("receita líquida negativa com margem positiva também mantém o sinal", () => {
    expect(margemPct(dec("50"), dec("-200")).isPositive()).toBe(true);
  });

  it("receita líquida zerada não estoura nem inventa percentual", () => {
    expect(margemPct(dec("-100"), dec("0")).toString()).toBe("0");
    expect(statusMargem(margemPct(dec("-100"), dec("0")), FAIXAS)?.label).toBe("Negativa");
  });

  it("o caso normal continua idêntico — não mexe no T6", () => {
    // Fixture Patricia (Calculations.md §6): RL 10.219,50 e margem 39,82%.
    expect(margemPct(dec("4069.08"), dec("10219.50")).toFixed(4)).toBe("0.3982");
    expect(statusMargem(margemPct(dec("4069.08"), dec("10219.50")), FAIXAS)?.label).toBe("Atenção");
  });
});

describe("selo de margem para Comercial", () => {
  it("classifica até 40% como vermelho", () => {
    expect(seloMargemComercial(dec("0.40"))).toEqual({ label: "Vermelha", color: "red" });
  });

  it("classifica acima de 40% até 50% como amarelo", () => {
    expect(seloMargemComercial(dec("0.4001"))).toEqual({ label: "Amarela", color: "yellow" });
    expect(seloMargemComercial(dec("0.50"))).toEqual({ label: "Amarela", color: "yellow" });
  });

  it("classifica acima de 50% até 65% como verde", () => {
    expect(seloMargemComercial(dec("0.5001"))).toEqual({ label: "Verde", color: "green" });
    expect(seloMargemComercial(dec("0.65"))).toEqual({ label: "Verde", color: "green" });
  });

  it("classifica acima de 65% como azul", () => {
    expect(seloMargemComercial(dec("0.6501"))).toEqual({ label: "Azul", color: "blue" });
  });
});

describe("cascata do pedido com prejuízo", () => {
  // Reproduz a forma do pedido do print: venda pequena, frete alto, CMV maior
  // que a receita líquida.
  const pedido = calcularPedido({
    itens: [{ nome: "Kit", precoVenda: "150", quantidade: "1", cmvUnitario: "103.35", despesaUnitaria: "0" }],
    frete: "150",
    fretePorContaCliente: false,
    aliquotaImposto: "0.1625",
    aliquotaDifal: "0.10",
    aliquotaComissao: "0.025",
  });

  it("a margem em reais é negativa", () => {
    expect(pedido.margemContribuicao.isNegative()).toBe(true);
  });

  it("e o percentual acompanha o sinal do dinheiro", () => {
    expect(pedido.margemContribuicaoPct.isNegative()).toBe(true);
    expect(statusMargem(pedido.margemContribuicaoPct, FAIXAS)?.label).toBe("Negativa");
  });
});

describe("denominador zerado na ficha técnica", () => {
  // Varredura de 04/08/2026: rendimento e tamanho de lote são denominadores, e
  // o decimal.js devolve Infinity para divisão por zero — sem reclamar. O CMV
  // do produto virava Infinity, e a trava de pedido (que só barra CMV <= 0)
  // deixava passar, porque Infinity é maior que zero.
  it("rendimento zero é bloqueante, não Infinity", () => {
    expect(() =>
      calcularCMV([
        {
          nome: "Bobina",
          custoUnitario: "2.42",
          quantidade: { tipo: "area", largura: "1", comprimento: "1.20", rendimento: "0" },
        },
      ]),
    ).toThrow(ErroCalculoBloqueante);
  });

  it("tamanho de lote zero é bloqueante", () => {
    expect(() =>
      calcularCMV([
        { nome: "Caixa", custoUnitario: "9.98", quantidade: { tipo: "lote", tamanhoLote: "0" } },
      ]),
    ).toThrow(ErroCalculoBloqueante);
  });

  it("e o caso normal continua calculando", () => {
    const r = calcularCMV([
      {
        nome: "Bobina",
        custoUnitario: "2.42",
        quantidade: { tipo: "area", largura: "1", comprimento: "1.20", rendimento: "0.99" },
      },
    ]);
    expect(r.cmv.isFinite()).toBe(true);
  });
});
