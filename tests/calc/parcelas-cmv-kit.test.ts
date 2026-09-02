import { describe, expect, it } from "vitest";
import { dec, parcelasDoCmvDoKit, parcelasDoCmvDoPedido } from "@calc";

// ============================================================
// As duas parcelas do CMV do kit — produtos e embalagem
// ============================================================
//
// Calculations.md §4.1: "A parcela de embalagem deve ser exibida DESTACADA,
// não diluída no total." Na tela do pedido e na folha, o CMV do kit era um
// número só.
//
// Os números abaixo são os do pedido 07020926 (ORC-2026-0142), de 02/09/2026:
// kit de 4 produtos, 20 unidades, com envelope 30x50, Caixa 6 e esterilização
// rateadas por 20, etiquetinha e gráfica. A Intertech comparou com a planilha
// (que usa um jogo FIXO de embalagem, o "Kit Aleatório") e a diferença de
// R$ 15,38 no CMV estava inteira na embalagem — invisível na linha única.

const CMV_DO_KIT = "10.877195659744337916617080"; // como ficou congelado no pedido
const COMPOSICAO = [
  { nome: "Campo de Mesa", quantidade: "1", cmvUnitario: "1.2481969696136073" },
  { nome: "Campo Simples GR30", quantidade: "1", cmvUnitario: "0.673156260584502" },
  { nome: "Avental Não Estéril", quantidade: "1", cmvUnitario: "2.817356975003229" },
  { nome: "Compressa P", quantidade: "5", cmvUnitario: "0.6686024242419999" },
];

describe("parcelasDoCmvDoKit", () => {
  it("separa produtos e embalagem do kit realmente vendido", () => {
    const p = parcelasDoCmvDoKit(CMV_DO_KIT, COMPOSICAO);
    expect(p).not.toBeNull();
    expect(p!.produtos.toFixed(6)).toBe("8.081722");
    // Envelope 1,03545 + Caixa 6 (9,9813÷20) + esterilização (23,72÷20)
    // + etiquetinha 0,008958333 + gráfica 0,066.
    expect(p!.embalagem.toFixed(6)).toBe("2.795473");
  });

  it("as duas parcelas somam exatamente o CMV congelado — nada se perde", () => {
    const p = parcelasDoCmvDoKit(CMV_DO_KIT, COMPOSICAO)!;
    expect(p.produtos.plus(p.embalagem).equals(dec(CMV_DO_KIT))).toBe(true);
  });

  it("kit sem embalagem cadastrada mostra a parcela zerada, não some", () => {
    // Zero aqui é informação: diz que o kit não tem envelope nem caixa.
    const soProdutos = parcelasDoCmvDoKit(CMV_DO_KIT, COMPOSICAO)!.produtos;
    const p = parcelasDoCmvDoKit(soProdutos.toString(), COMPOSICAO)!;
    expect(p.embalagem.isZero()).toBe(true);
  });

  it("snapshot antigo, sem o CMV dos componentes, não vira número inventado", () => {
    expect(parcelasDoCmvDoKit(CMV_DO_KIT, [{ quantidade: "1" }])).toBeNull();
    expect(parcelasDoCmvDoKit(CMV_DO_KIT, null)).toBeNull();
    expect(parcelasDoCmvDoKit(CMV_DO_KIT, [])).toBeNull();
    expect(parcelasDoCmvDoKit(null, COMPOSICAO)).toBeNull();
  });

  it("embalagem negativa é conta que não fecha — a tela não finge que fecha", () => {
    // CMV gravado menor que a soma dos componentes: snapshot e composição de
    // momentos diferentes.
    expect(parcelasDoCmvDoKit("5", COMPOSICAO)).toBeNull();
  });
});

describe("parcelasDoCmvDoPedido", () => {
  it("soma as parcelas de todos os itens, na quantidade vendida", () => {
    const p = parcelasDoCmvDoPedido([
      { quantidade: "20", cmvUnitario: CMV_DO_KIT, composicaoKit: COMPOSICAO },
    ])!;
    expect(p.produtos.toFixed(2)).toBe("161.63");
    expect(p.embalagem.toFixed(2)).toBe("55.91");
    // O CMV do pedido, que a folha imprime.
    expect(p.produtos.plus(p.embalagem).toFixed(2)).toBe("217.54");
  });

  it("produto avulso entra inteiro em produtos: a embalagem dele está na ficha técnica", () => {
    const p = parcelasDoCmvDoPedido([
      { quantidade: "20", cmvUnitario: CMV_DO_KIT, composicaoKit: COMPOSICAO },
      { quantidade: "10", cmvUnitario: "2", composicaoKit: null },
    ])!;
    expect(p.produtos.toFixed(2)).toBe("181.63");
    expect(p.embalagem.toFixed(2)).toBe("55.91");
  });

  it("pedido sem kit nenhum não tem embalagem para destacar", () => {
    expect(parcelasDoCmvDoPedido([{ quantidade: "10", cmvUnitario: "2" }])).toBeNull();
    expect(parcelasDoCmvDoPedido([])).toBeNull();
    expect(parcelasDoCmvDoPedido(null)).toBeNull();
  });

  it("um kit que não se deixa separar invalida o total — metade separada não diz nada", () => {
    expect(
      parcelasDoCmvDoPedido([
        { quantidade: "20", cmvUnitario: CMV_DO_KIT, composicaoKit: COMPOSICAO },
        { quantidade: "1", cmvUnitario: "9", composicaoKit: [{ quantidade: "1" }] },
      ])
    ).toBeNull();
  });
});
