import { describe, expect, it } from "vitest";
import {
  Decimal,
  ErroCalculoBloqueante,
  assinaturaKit,
  calcularAlocacao,
  calcularCMV,
  calcularCMVsEmCascata,
  calcularPedido,
  precoSemImposto,
  toMoney,
  toPercent,
  type ComponenteFicha,
  type InsumoCascata,
  type ProdutoCascata,
} from "@calc";

// ============================================================
// GOLDEN TESTS — Calculations.md §11
// ------------------------------------------------------------
// Estes testes reproduzem exemplos numéricos REAIS da planilha
// "Rentabilidade 2026". São a fonte única de verdade dos cálculos:
// se um deles quebra, o motor está errado — nunca o contrário.
//
// REGRA DO PROJETO (CLAUDE.md): são OBRIGATÓRIOS e NUNCA podem ser
// removidos. Novas funções de cálculo entram com o seu golden test.
//
// Tolerância: 0,01 centavo (R$ 0,0001), como manda a Seção 11.
// ============================================================

const TOLERANCIA = new Decimal("0.0001");

// Compara dois valores em precisão total dentro da tolerância de 0,01 centavo.
function esperarProximo(atual: Decimal, esperado: string): void {
  const diff = atual.minus(esperado).abs();
  expect(
    diff.lte(TOLERANCIA),
    `esperado ~${esperado}, obtido ${atual.toString()} (diferença ${diff.toString()})`
  ).toBe(true);
}

describe("Camada 1 — preço sem imposto", () => {
  it("T1 — Fita adesiva 9830 (377,49; ICMS 18%; PIS/COFINS 9,25%)", () => {
    esperarProximo(precoSemImposto("377.49", "0.18", "0.0925"), "274.623975");
  });

  it("T2 — Bobina SMS 40gr m² (0,872; ICMS 12%; PIS/COFINS 9,25%)", () => {
    esperarProximo(precoSemImposto("0.872", "0.12", "0.0925"), "0.6867");
  });
});

describe("Camada 2 — CMV do produto", () => {
  it("T3 — Campo Catarata 1,00 x 1,20 GR40 (ficha da Seção 3) = 2,935400", () => {
    // Cada linha: nome, preço sem imposto (custo unitário) e a quantidade como
    // expressão estruturada (área com perda, rateio por lote ou direta).
    const ficha: ComponenteFicha[] = [
      { nome: "Fita adesiva 9830", custoUnitario: "274.623975", quantidade: { tipo: "lote", tamanhoLote: "450" } },
      { nome: "Bag", custoUnitario: "0.6351075", quantidade: { tipo: "direta", quantidade: "1" } },
      { nome: "Bobina SMS 40gr m²", custoUnitario: "0.6867", quantidade: { tipo: "area", largura: "1", comprimento: "1.2", rendimento: "0.99" } },
      { nome: "Caixa 6", custoUnitario: "9.9813", quantidade: { tipo: "lote", tamanhoLote: "150" } },
      { nome: "Envelope 25x30", custoUnitario: "0.51802", quantidade: { tipo: "direta", quantidade: "1" } },
      { nome: "Esterilização Horizont", custoUnitario: "23.72", quantidade: { tipo: "lote", tamanhoLote: "150" } },
      { nome: "Etiqueta adesiva catarata", custoUnitario: "0.04", quantidade: { tipo: "direta", quantidade: "1" } },
      { nome: "Etiquetinha", custoUnitario: "0.008958", quantidade: { tipo: "direta", quantidade: "1" } },
      { nome: "Gráfica", custoUnitario: "0.066", quantidade: { tipo: "direta", quantidade: "1" } },
    ];

    const { cmv, componentes } = calcularCMV(ficha);
    esperarProximo(cmv, "2.935400");

    // As participações somam 100% (nada se perde no rateio).
    const somaPart = componentes.reduce((s, c) => s.plus(c.participacao), new Decimal(0));
    esperarProximo(somaPart, "1");
  });
});

describe("Camada 3 — despesa unitária alocada", () => {
  // Total de despesa e soma dos pesos do período inteiro (Calculations.md §5).
  const TOTAL = "450000";
  const SOMA_PESOS = "14445616";

  it("T4 — Avental (produção 20.000; fator 70) = 2,180592", () => {
    const r = calcularAlocacao({ producaoEstimada: "20000", fatorComplexidade: "70", totalDespesa: TOTAL, somaPesos: SOMA_PESOS });
    esperarProximo(r.despesaUnitaria, "2.180592");
    // A memória de cálculo do §5 é exibida a 2 casas (a planilha mostra assim);
    // internamente o valor tem precisão total (43.611,8531...).
    expect(toMoney(r.despesaAlocada)).toBe("43611.85");
    expect(toPercent(r.participacao)).toBe("9.69"); // 9,6915% → 9,69% na exibição
  });

  it("T5 — Campo Catarata GR40 (produção 10.000; fator 100) = 3,115132", () => {
    const r = calcularAlocacao({ producaoEstimada: "10000", fatorComplexidade: "100", totalDespesa: TOTAL, somaPesos: SOMA_PESOS });
    esperarProximo(r.despesaUnitaria, "3.115132");
    expect(toMoney(r.despesaAlocada)).toBe("31151.32");
  });
});

describe("Camada 4 — pedido completo", () => {
  // Fixture real da aba Patricia (Calculations.md §6):
  // Unimed Salto Itu, UF BA, Avental TNT Sem Manga Não Estéril, 4,20 × 4.000.
  const itemAvental = {
    nome: "Avental TNT Sem Manga Não Estéril",
    precoVenda: "4.20",
    quantidade: "4000",
    cmvUnitario: "1.537605",
    despesaUnitaria: "0.778783",
  };

  it("T6 — pedido UF BA: receita líquida 10.219,50 e margem 39,82%", () => {
    const r = calcularPedido({
      itens: [itemAvental],
      frete: "1000",
      aliquotaImposto: "0.1625", // ICSM BA = 16,25%
      aliquotaDifal: "0.135",    // DIFAL BA = 13,5%
      aliquotaComissao: "0.025",
    });

    esperarProximo(r.receitaBruta, "16800");
    esperarProximo(r.cmvTotal, "6150.42");
    esperarProximo(r.imposto, "2730");
    esperarProximo(r.difal, "2268");
    esperarProximo(r.comissao, "420");
    esperarProximo(r.impostoFrete, "162.50");
    esperarProximo(r.receitaLiquida, "10219.50");
    esperarProximo(r.margemContribuicao, "4069.08");
    expect(toPercent(r.margemContribuicaoPct)).toBe("39.82");
    // O mesmo pedido, se descontasse a despesa rateada, cairia para 9,33% (§6).
    expect(toPercent(r.resultadoAposRateioPct)).toBe("9.33");
  });

  it("T7 — mesmo pedido em UF SP: imposto 27,25% e DIFAL 0", () => {
    const r = calcularPedido({
      itens: [itemAvental],
      frete: "1000",
      aliquotaImposto: "0.2725", // ICSM SP = 27,25% (venda interna)
      aliquotaDifal: "0",        // SP não tem DIFAL
      aliquotaComissao: "0.025",
    });

    esperarProximo(r.imposto, "4578");      // 27,25% × 16.800
    esperarProximo(r.difal, "0");
    esperarProximo(r.impostoFrete, "272.50"); // 27,25% × 1.000
  });

  it("T9 — item com CMV = 0 é erro bloqueante (nunca zero silencioso)", () => {
    expect(() =>
      calcularPedido({
        itens: [{ nome: "Produto sem ficha", precoVenda: "10", quantidade: "100", cmvUnitario: "0", despesaUnitaria: "0" }],
        frete: "0",
        aliquotaImposto: "0.1625",
        aliquotaDifal: "0",
        aliquotaComissao: "0.025",
      })
    ).toThrow(ErroCalculoBloqueante);
  });
});

describe("Camada 2b — recálculo de kit em cascata", () => {
  // T8: um kit contém o produto Avental; o Avental consome a Bobina SMS.
  // Mudar o preço da Bobina deve refletir no CMV do Avental E do kit.
  const bobina = (precoComImposto: string): InsumoCascata => ({
    id: "bobina-sms",
    precoComImposto,
    icms: "0.12",
    pisCofins: "0.0925",
  });
  const produtos: ProdutoCascata[] = [
    // Avental consome Bobina SMS por área (1 × 1,2 ÷ 0,99).
    {
      id: "avental",
      componentes: [
        { tipo: "insumo", insumoId: "bobina-sms", quantidade: { tipo: "area", largura: "1", comprimento: "1.2", rendimento: "0.99" } },
      ],
    },
    // Kit leva 2 aventais.
    {
      id: "kit-avental",
      componentes: [
        { tipo: "produto", produtoId: "avental", quantidade: { tipo: "direta", quantidade: "2" } },
      ],
    },
  ];

  it("T8 — alterar o preço da Bobina SMS recalcula o CMV do kit", () => {
    // Preço original 0,872 -> sem imposto 0,6867.
    const antes = calcularCMVsEmCascata([bobina("0.872")], produtos);
    // Dobrando o preço (1,744) -> sem imposto 1,3734 (o dobro).
    const depois = calcularCMVsEmCascata([bobina("1.744")], produtos);

    // O CMV do kit muda e, como o preço dobrou, o CMV do kit dobra.
    const kitAntes = antes.get("kit-avental")!;
    const kitDepois = depois.get("kit-avental")!;
    expect(kitDepois.gt(kitAntes)).toBe(true);
    esperarProximo(kitDepois, kitAntes.times(2).toString());
    // Valor absoluto: 0,6867 × (1,2/0,99) × 2 = 1,664727…
    esperarProximo(kitAntes, "1.664727");
  });

  it("detecta referência circular em cascata (A contém B contém A)", () => {
    const circular: ProdutoCascata[] = [
      { id: "A", componentes: [{ tipo: "produto", produtoId: "B", quantidade: { tipo: "direta", quantidade: "1" } }] },
      { id: "B", componentes: [{ tipo: "produto", produtoId: "A", quantidade: { tipo: "direta", quantidade: "1" } }] },
    ];
    expect(() => calcularCMVsEmCascata([], circular)).toThrow(ErroCalculoBloqueante);
  });
});

describe("Kits — assinatura única (PRD §6.5)", () => {
  it("T10 — mesma composição em ordem diferente gera a mesma assinatura", () => {
    const ordemA = assinaturaKit([
      { produtoId: "produto_7", quantidade: "1" },
      { produtoId: "produto_3", quantidade: "2" },
      { produtoId: "produto_12", quantidade: "5" },
    ]);
    const ordemB = assinaturaKit([
      { produtoId: "produto_12", quantidade: "5" },
      { produtoId: "produto_3", quantidade: "2" },
      { produtoId: "produto_7", quantidade: "1" },
    ]);
    expect(ordemA).toBe(ordemB);
    expect(ordemA).toBe("produto_12:5|produto_3:2|produto_7:1");

    // Composição diferente (quantidade mudou) → assinatura diferente.
    const outra = assinaturaKit([
      { produtoId: "produto_3", quantidade: "3" },
      { produtoId: "produto_7", quantidade: "1" },
      { produtoId: "produto_12", quantidade: "5" },
    ]);
    expect(outra).not.toBe(ordemA);
  });

  it("consolida itens repetidos e normaliza quantidades equivalentes", () => {
    // 2 + 3 do mesmo produto = 5; "5.0" e "5" são a mesma quantidade.
    const somada = assinaturaKit([
      { produtoId: "p1", quantidade: "2" },
      { produtoId: "p1", quantidade: "3" },
    ]);
    const direta = assinaturaKit([{ produtoId: "p1", quantidade: "5.0" }]);
    expect(somada).toBe(direta);
    expect(direta).toBe("p1:5");
  });

  it("kit sem itens ou com quantidade inválida é erro bloqueante", () => {
    expect(() => assinaturaKit([])).toThrow(ErroCalculoBloqueante);
    expect(() => assinaturaKit([{ produtoId: "p1", quantidade: "0" }])).toThrow(ErroCalculoBloqueante);
  });
});

describe("Exibição — arredondamento só na ponta (Calculations.md §9.9)", () => {
  it("mantém precisão total no cálculo e arredonda a 2 casas só para exibir", () => {
    // 274,623975 continua com todos os dígitos internamente...
    const valor = precoSemImposto("377.49", "0.18", "0.0925");
    expect(valor.toString()).toBe("274.623975");
    // ...e vira "274.62" apenas quando formatado em R$.
    expect(toMoney(valor)).toBe("274.62");
  });
});
