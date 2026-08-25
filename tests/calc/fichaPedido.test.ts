import { describe, expect, it } from "vitest";
import { difalNoBlocoComercial, totaisDaFichaDoPedido, totalACobrarDoCliente } from "@calc";

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

// ============================================================
// O TOTAL da folha não cobra imposto do cliente (24/08/2026)
// ============================================================
//
// A folha passou a IMPRIMIR o valor do DIFAL porque a vendedora precisava
// vê-lo (Calculations.md §12.4). Com o número à vista, uma linha acima do
// TOTAL, o erro fácil vira somar um no outro — e aí a folha de conferência
// cobra do cliente um imposto que é custo da Intertech (§12.1). Estes testes
// existem para esse erro não passar despercebido.

describe("totalACobrarDoCliente", () => {
  it("é subtotal + frete", () => {
    expect(totalACobrarDoCliente("1865", "145").toString()).toBe("2010");
  });

  it("pedido de Patrocínio/MG do print: DIFAL de 120,60 NÃO entra no total", () => {
    // Itens do print: 100×9,80 + 50×7,20 + 50×5,90 + 100×2,30 = 1.865,00
    const itens = totaisDaFichaDoPedido([
      { quantidade: "100", precoUnitario: "9.80" },
      { quantidade: "50", precoUnitario: "7.20" },
      { quantidade: "50", precoUnitario: "5.90" },
      { quantidade: "100", precoUnitario: "2.30" },
    ]);
    expect(itens.subtotal.toString()).toBe("1865");

    // Frete BRASPRESS escolhido no print. O DIFAL de MG é 6% × (1.865 + 145) =
    // 120,60 e fica de fora: o total cobrado é o mesmo com ou sem ele.
    const total = totalACobrarDoCliente(itens.subtotal, "145");
    expect(total.toString()).toBe("2010");
    expect(total.plus("120.60").toString()).not.toBe(total.toString());
  });

  it("frete zero não muda o subtotal", () => {
    expect(totalACobrarDoCliente("46.8", "0").toString()).toBe("46.8");
  });

  it("não arredonda: precisão total até a exibição", () => {
    expect(totalACobrarDoCliente("0.005", "0.005").toString()).toBe("0.01");
  });
});

// ============================================================
// DIFAL destacado e não destacado (regra da Intertech, 25/08/2026)
// ============================================================
//
// A folha do cliente só mostra o DIFAL onde ele está sendo cobrado. Onde não
// está, some do bloco comercial — mas continua saindo da margem, no bloco de
// uso interno, que é o que bate com a planilha de Rentabilidade.
describe("difalNoBlocoComercial", () => {
  it("UF destacada imprime o valor", () => {
    const r = difalNoBlocoComercial({ destacado: true, valor: "145.80", calculando: false });
    expect(r).toEqual({ texto: "145.80", imprimeValor: true });
  });

  it("UF não destacada não imprime valor nenhum, mesmo havendo DIFAL calculado", () => {
    const r = difalNoBlocoComercial({ destacado: false, valor: "145.80", calculando: false });
    expect(r).toEqual({ texto: "não destacado", imprimeValor: false });
  });

  it("destacada e ainda calculando avisa, em vez de mostrar traço", () => {
    expect(difalNoBlocoComercial({ destacado: true, valor: null, calculando: true }).texto).toBe("calculando…");
    expect(difalNoBlocoComercial({ destacado: true, valor: null, calculando: false }).texto).toBe("—");
  });

  // A trava que importa: destacar ou não NUNCA mexe no que se cobra do cliente.
  it("o TOTAL do cliente é o mesmo destacado ou não", () => {
    const total = totalACobrarDoCliente("1015", "200");
    expect(total.toString()).toBe("1215");
  });
});
