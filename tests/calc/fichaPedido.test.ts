import { describe, expect, it } from "vitest";
import { totaisDaFichaDoPedido } from "@calc";

// A ficha impressa do pedido (formulário de papel, 05/08/2026). O que se
// protege aqui é o subtotal impresso bater com a soma das linhas impressas —
// a conferência confere justamente isso, à mão, na mesa.

describe("totaisDaFichaDoPedido", () => {
  // Mesmo item do fixture da aba Patricia (Calculations.md §6): o SUBTOTAL do
  // formulário é a mesma receita bruta da cascata, com outro nome.
  it("reproduz o fixture Patricia: 4,20 × 4.000 = 16.800", () => {
    const r = totaisDaFichaDoPedido([{ quantidade: "4000", precoUnitario: "4.20" }]);
    expect(r.linhas[0].total.toString()).toBe("16800");
    expect(r.subtotal.toString()).toBe("16800");
  });

  it("o subtotal é exatamente a soma das linhas", () => {
    const r = totaisDaFichaDoPedido([
      { quantidade: "3", precoUnitario: "10.10" },
      { quantidade: "7", precoUnitario: "2.35" },
      { quantidade: "1", precoUnitario: "0.05" },
    ]);
    expect(r.linhas.map((l) => l.total.toString())).toEqual(["30.3", "16.45", "0.05"]);
    expect(r.subtotal.toString()).toBe("46.8");
  });

  // Preço com muitas casas é comum: o CMV sai com seis. Arredondar por linha
  // e somar depois daria um subtotal diferente de somar e arredondar no fim.
  it("não arredonda por linha — precisão total até a exibição", () => {
    const r = totaisDaFichaDoPedido([
      { quantidade: "3", precoUnitario: "0.005" },
      { quantidade: "3", precoUnitario: "0.005" },
    ]);
    expect(r.subtotal.toString()).toBe("0.03");
  });

  it("pedido sem itens tem subtotal zero", () => {
    const r = totaisDaFichaDoPedido([]);
    expect(r.linhas).toEqual([]);
    expect(r.subtotal.toString()).toBe("0");
  });

  it("aceita quantidade fracionária", () => {
    const r = totaisDaFichaDoPedido([{ quantidade: "2.5", precoUnitario: "4" }]);
    expect(r.linhas[0].total.toString()).toBe("10");
  });
});
