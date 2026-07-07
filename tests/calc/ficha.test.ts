import { describe, expect, it } from "vitest";
import { Decimal, calcularFicha, type InsumoCascata, type ProdutoCascata } from "@calc";

// Testa a ficha técnica com participação % (PRD §6.3), incluindo um componente
// que é outro produto (kit em cascata).
describe("ficha técnica — participação %", () => {
  const insumos: InsumoCascata[] = [
    // A: sem imposto = 10
    { id: "insA", precoComImposto: "10", icms: "0", pisCofins: "0" },
    // B: sem imposto = 5
    { id: "insB", precoComImposto: "5", icms: "0", pisCofins: "0" },
  ];
  const produtos: ProdutoCascata[] = [
    // Sub-produto: 1× A -> CMV 10
    { id: "sub", componentes: [{ tipo: "insumo", insumoId: "insA", quantidade: { tipo: "direta", quantidade: "1" } }] },
    // Produto final: 1× B (custo 5) + 1× sub (custo 10) -> CMV 15
    {
      id: "final",
      componentes: [
        { tipo: "insumo", insumoId: "insB", quantidade: { tipo: "direta", quantidade: "1" } },
        { tipo: "produto", produtoId: "sub", quantidade: { tipo: "direta", quantidade: "1" } },
      ],
    },
  ];

  it("calcula CMV e participação de cada componente (kit incluso)", () => {
    const { cmv, linhas } = calcularFicha("final", insumos, produtos);
    expect(cmv.toString()).toBe("15");

    const insumoLinha = linhas.find((l) => l.refId === "insB")!;
    const kitLinha = linhas.find((l) => l.refId === "sub")!;
    expect(insumoLinha.custo.toString()).toBe("5");
    expect(kitLinha.custo.toString()).toBe("10"); // CMV do sub-produto em cascata

    // Participações: 5/15 = 33,33% e 10/15 = 66,67%; somam 100%.
    const soma = linhas.reduce((s, l) => s.plus(l.participacao), new Decimal(0));
    expect(soma.toString()).toBe("1");
    expect(insumoLinha.participacao.toFixed(4)).toBe("0.3333");
    expect(kitLinha.participacao.toFixed(4)).toBe("0.6667");
  });
});
