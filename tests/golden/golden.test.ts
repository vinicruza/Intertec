import { describe, expect, it } from "vitest";
import {
  Decimal,
  ErroCalculoBloqueante,
  assinaturaKit,
  assinaturaKitCompleta,
  calcularAlocacao,
  calcularCMV,
  calcularCMVsEmCascata,
  calcularCMVsEmCascataDetalhado,
  calcularPedido,
  custoKit,
  custoKitCompleto,
  precoSemImposto,
  toMoney,
  dec,
  margemPct,
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

  // ⚠️ Valores revisados em 18/08/2026: a base da comissão passou a incluir o
  // frete (ver T16). O pedido-fixture é o mesmo da planilha; o que mudou foi a
  // regra que o cliente confirmou, não o exemplo. Antes desta data este teste
  // esperava comissão 420,00, RL 10.219,50 e margem 39,82%.
  it("T6 — pedido UF BA: receita líquida 10.194,50 e margem 39,67%", () => {
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
    esperarProximo(r.baseComissao, "17800"); // 16.800 de venda + 1.000 de frete
    esperarProximo(r.comissao, "445");
    esperarProximo(r.impostoFrete, "162.50");
    esperarProximo(r.receitaLiquida, "10194.50");
    esperarProximo(r.margemContribuicao, "4044.08");
    expect(toPercent(r.margemContribuicaoPct)).toBe("39.67");
    // O mesmo pedido, se descontasse a despesa rateada, cairia para 9,11% (§6).
    expect(toPercent(r.resultadoAposRateioPct)).toBe("9.11");
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

  it("a embalagem faz parte da identidade do kit, sem quebrar os kits antigos", () => {
    const itens = [{ produtoId: "p1", quantidade: "2" }];
    // Sem embalagem: assinatura idêntica à de antes (kits já cadastrados valem).
    expect(assinaturaKitCompleta(itens)).toBe(assinaturaKit(itens));

    // Mesmos produtos, número de caixas diferente = kits diferentes, porque o
    // CMV é diferente. Colidir aqui faria o segundo herdar o custo do primeiro.
    const umaCaixa = assinaturaKitCompleta(itens, [{ insumoId: "caixa", quantidade: { tipo: "direta", quantidade: "1" } }]);
    const duasCaixas = assinaturaKitCompleta(itens, [{ insumoId: "caixa", quantidade: { tipo: "direta", quantidade: "2" } }]);
    expect(umaCaixa).not.toBe(duasCaixas);
    expect(umaCaixa).not.toBe(assinaturaKit(itens));

    // A ordem da embalagem não importa, como nos produtos.
    const ordemA = assinaturaKitCompleta(itens, [
      { insumoId: "envelope", quantidade: { tipo: "direta", quantidade: "1" } },
      { insumoId: "caixa", quantidade: { tipo: "direta", quantidade: "2" } },
    ]);
    const ordemB = assinaturaKitCompleta(itens, [
      { insumoId: "caixa", quantidade: { tipo: "direta", quantidade: "2" } },
      { insumoId: "envelope", quantidade: { tipo: "direta", quantidade: "1" } },
    ]);
    expect(ordemA).toBe(ordemB);
  });
});

describe("Kits — embalagem e esterilização do kit (T11)", () => {
  // Reunião Intertech 16/07/2026: o envelope é UM só e a caixa de esterilização
  // é UMA só POR KIT. Antes disso a rentabilidade usava um valor aproximado
  // ("kit aleatório"), que a própria empresa apontou como errado.
  const custos = new Map([
    ["avental", { cmv: "4.043151" }],
    ["campo", { cmv: "2.935400" }],
  ]);
  const itens = [
    { produtoId: "avental", quantidade: "2" },
    { produtoId: "campo", quantidade: "3" },
  ];

  it("T11 — soma a embalagem UMA vez por kit, não por produto", () => {
    // Produtos: 4,043151×2 + 2,935400×3 = 8,086302 + 8,806200 = 16,892502
    // Embalagem: 1 envelope (0,51802) + 2 caixas (9,9813 ÷ 150 = 0,066542 cada)
    const r = custoKitCompleto(itens, custos, [
      { nome: "Envelope 25x30", custoUnitario: "0.51802", quantidade: { tipo: "direta", quantidade: "1" } },
      { nome: "Caixa 6 (rateada por 150)", custoUnitario: "0.066542", quantidade: { tipo: "direta", quantidade: "2" } },
    ]);

    esperarProximo(r.custoProdutos, "16.892502");
    esperarProximo(r.custoEmbalagem, "0.651104"); // 0,51802 + 0,133084
    esperarProximo(r.custoTotal, "17.543606");

    // O custo de embalagem fica DESTACADO, não diluído (pedido na reunião).
    expect(r.linhasEmbalagem).toHaveLength(2);
    esperarProximo(r.linhasEmbalagem[1].custo, "0.133084");
  });

  it("T11e — participação de custo por produto e por embalagem soma 100% do kit (30/07/2026)", () => {
    // Pedido do cliente: "não saberemos qual produto deu maior ou menor
    // margem em cada kit". Não existe preço por produto dentro do kit (o
    // cliente negocia o kit inteiro) — o que existe, e é isso que o cliente
    // aceitou como caminho, é o peso de custo de cada item no kit.
    const r = custoKitCompleto(itens, custos, [
      { nome: "Envelope 25x30", custoUnitario: "0.51802", quantidade: { tipo: "direta", quantidade: "1" } },
      { nome: "Caixa 6 (rateada por 150)", custoUnitario: "0.066542", quantidade: { tipo: "direta", quantidade: "2" } },
    ]);

    expect(r.linhasProdutos).toHaveLength(2);
    esperarProximo(r.linhasProdutos[0].participacao, "0.460925"); // avental
    esperarProximo(r.linhasProdutos[1].participacao, "0.501960"); // campo
    esperarProximo(r.linhasEmbalagem[0].participacao, "0.029527"); // envelope
    esperarProximo(r.linhasEmbalagem[1].participacao, "0.007585"); // caixa

    // As frações de TODAS as linhas (produtos + embalagem) somam o kit inteiro.
    const soma = [...r.linhasProdutos, ...r.linhasEmbalagem].reduce(
      (s, l) => s.plus(l.participacao),
      new Decimal(0)
    );
    esperarProximo(soma, "1");
  });

  it("T11c — a caixa de esterilização é RATEADA pelos itens que cabem nela", () => {
    // Correção vinda da Intertech (áudio de 29/07/2026): no kit, a quantidade
    // por caixa varia conforme o que foi montado. Lançar a caixa como "1 por
    // kit" cobraria a caixa inteira de cada kit — se cabem 10, o custo sai
    // dez vezes maior.
    const caixaInteira = "9.9813";

    const errado = custoKitCompleto(itens, custos, [
      { nome: "Caixa esterilização", custoUnitario: caixaInteira, quantidade: { tipo: "direta", quantidade: "1" } },
    ]);
    const certo = custoKitCompleto(itens, custos, [
      { nome: "Caixa esterilização", custoUnitario: caixaInteira, quantidade: { tipo: "lote", tamanhoLote: "10" } },
    ]);

    // Cabendo 10 kits na caixa, cada kit carrega um décimo dela.
    esperarProximo(errado.custoEmbalagem, "9.9813");
    esperarProximo(certo.custoEmbalagem, "0.99813");
    esperarProximo(errado.custoEmbalagem.div(certo.custoEmbalagem), "10");

    // O envelope continua sendo um por kit — a distinção é por linha.
    const misto = custoKitCompleto(itens, custos, [
      { nome: "Envelope 40x55", custoUnitario: "0.51802", quantidade: { tipo: "direta", quantidade: "1" } },
      { nome: "Caixa esterilização", custoUnitario: caixaInteira, quantidade: { tipo: "lote", tamanhoLote: "10" } },
    ]);
    esperarProximo(misto.custoEmbalagem, "1.51615"); // 0,51802 + 0,99813
  });

  it("T11d — itens por caixa diferentes são kits diferentes", () => {
    // Mesmos produtos e mesma caixa, mas rateio diferente: o CMV difere, então
    // a identidade precisa diferir. Se colidissem, o segundo herdaria o custo
    // do primeiro no índice único.
    const paraDez = assinaturaKitCompleta(itens, [
      { insumoId: "caixa", quantidade: { tipo: "lote", tamanhoLote: "10" } },
    ]);
    const paraVinte = assinaturaKitCompleta(itens, [
      { insumoId: "caixa", quantidade: { tipo: "lote", tamanhoLote: "20" } },
    ]);
    const duasUnidades = assinaturaKitCompleta(itens, [
      { insumoId: "caixa", quantidade: { tipo: "direta", quantidade: "2" } },
    ]);

    expect(paraDez).not.toBe(paraVinte);
    // "2 caixas por kit" e "caixa para 2 itens" são coisas opostas.
    expect(duasUnidades).not.toBe(
      assinaturaKitCompleta(itens, [{ insumoId: "caixa", quantidade: { tipo: "lote", tamanhoLote: "2" } }])
    );
    expect(paraDez).toContain("caixa:/10");
    expect(duasUnidades).toContain("caixa:2");
  });

  it("T11b — kit sem embalagem informada tem custo igual à soma dos produtos", () => {
    const r = custoKitCompleto(itens, custos);
    esperarProximo(r.custoEmbalagem, "0");
    esperarProximo(r.custoTotal, "16.892502");
    // Compatível com o custoKit histórico (só a soma ponderada dos produtos).
    const legado = custoKit(itens, new Map([["avental", "4.043151"], ["campo", "2.935400"]]));
    esperarProximo(r.custoTotal, legado.toString());
  });

  it("produto sem custo vigente é erro bloqueante (nunca zero silencioso)", () => {
    expect(() =>
      custoKitCompleto([{ produtoId: "fantasma", quantidade: "1" }], custos)
    ).toThrow(ErroCalculoBloqueante);
  });
});

describe("CMV com e sem mão de obra (T12)", () => {
  // Reunião Intertech 16/07/2026: a costureira fica dentro do CMV, mas o DRE
  // por competência precisa do CMV sem ela — paga-se por produção passada.
  it("T12 — separa a costureira do CMV do produto", () => {
    const ficha: ComponenteFicha[] = [
      { nome: "Bobina SMS 40gr m²", custoUnitario: "0.6867", quantidade: { tipo: "area", largura: "1", comprimento: "1.2", rendimento: "0.99" } },
      { nome: "Punho", custoUnitario: "0.1457425", quantidade: { tipo: "direta", quantidade: "2" } },
      { nome: "Custo costureira avental M G", custoUnitario: "0.85", quantidade: { tipo: "direta", quantidade: "1" }, maoDeObra: true },
    ];

    const r = calcularCMV(ficha);
    // Bobina 0,832363… + punho 0,291485 + costureira 0,85
    esperarProximo(r.custoMaoDeObra, "0.85");
    esperarProximo(r.cmv, "1.973848");
    esperarProximo(r.cmvSemMaoDeObra, "1.123848");
    // As duas leituras diferem exatamente pelo custo de mão de obra.
    esperarProximo(r.cmv.minus(r.cmvSemMaoDeObra), "0.85");
    // A participação continua sobre o CMV cheio e ainda soma 100%.
    const somaPart = r.componentes.reduce((s, c) => s.plus(c.participacao), new Decimal(0));
    esperarProximo(somaPart, "1");
  });

  it("T12b — a mão de obra propaga em cascata até o kit", () => {
    const insumos: InsumoCascata[] = [
      { id: "bobina", precoComImposto: "0.872", icms: "0.12", pisCofins: "0.0925" },
      // Insumo de mão de obra: sem imposto a recuperar, valor cheio.
      { id: "costureira", precoComImposto: "0.85", icms: "0", pisCofins: "0", maoDeObra: true },
    ];
    const produtos: ProdutoCascata[] = [
      {
        id: "avental",
        componentes: [
          { tipo: "insumo", insumoId: "bobina", quantidade: { tipo: "area", largura: "1", comprimento: "1.2", rendimento: "0.99" } },
          { tipo: "insumo", insumoId: "costureira", quantidade: { tipo: "direta", quantidade: "1" } },
        ],
      },
      // Kit leva 2 aventais → deve carregar 2 × a costureira.
      {
        id: "kit",
        componentes: [{ tipo: "produto", produtoId: "avental", quantidade: { tipo: "direta", quantidade: "2" } }],
      },
    ];

    const mapa = calcularCMVsEmCascataDetalhado(insumos, produtos);
    const avental = mapa.get("avental")!;
    const kit = mapa.get("kit")!;

    esperarProximo(avental.custoMaoDeObra, "0.85");
    esperarProximo(avental.cmvSemMaoDeObra, "0.832363");
    // O kit herda a mão de obra dos produtos que o compõem.
    esperarProximo(kit.custoMaoDeObra, "1.70");
    esperarProximo(kit.cmv, avental.cmv.times(2).toString());
    esperarProximo(kit.cmvSemMaoDeObra, "1.664727");
  });

  it("T12c — ficha sem mão de obra: as duas leituras são iguais", () => {
    const r = calcularCMV([
      { nome: "Bag", custoUnitario: "0.6351075", quantidade: { tipo: "direta", quantidade: "1" } },
    ]);
    esperarProximo(r.custoMaoDeObra, "0");
    esperarProximo(r.cmvSemMaoDeObra, r.cmv.toString());
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

describe("T14/T15 — correções de 04/08/2026 (Calculations.md §6)", () => {
  // Encontrados por teste de tela, um dia antes da operação começar.

  // Mesmo item do fixture Patricia usado em T6/T7.
  const itemAvental = {
    nome: "Avental TNT Sem Manga Não Estéril",
    precoVenda: "4.20",
    quantidade: "4000",
    cmvUnitario: "1.537605",
    despesaUnitaria: "0.778783",
  };

  it("T14 — frete por conta do cliente zera frete E imposto sobre o frete", () => {
    const r = calcularPedido({
      itens: [itemAvental],
      frete: "1000",
      fretePorContaCliente: true,
      aliquotaImposto: "0.1625",
      aliquotaDifal: "0.135",
      aliquotaComissao: "0.025",
    });

    esperarProximo(r.frete, "0");
    esperarProximo(r.impostoFrete, "0");
    esperarProximo(r.freteInformado, "1000"); // o que veio na entrada, para auditoria
    // 16.800 − 2.730 − 2.268 − 445. Nem 9.219,50 (frete saindo duas vezes,
    // como era antes), nem 10.194,50 (frete saindo uma vez).
    esperarProximo(r.receitaLiquida, "11357");
    esperarProximo(r.margemContribuicao, "5206.58");
    // A comissão NÃO cai junto com o frete: o transporte foi vendido, e a base
    // segue o frete informado (T16).
    esperarProximo(r.comissao, "445");
  });

  it("T14b — sem a flag, o pedido continua exatamente igual ao T6", () => {
    const r = calcularPedido({
      itens: [itemAvental],
      frete: "1000",
      fretePorContaCliente: false,
      aliquotaImposto: "0.1625",
      aliquotaDifal: "0.135",
      aliquotaComissao: "0.025",
    });
    esperarProximo(r.receitaLiquida, "10194.50");
    expect(toPercent(r.margemContribuicaoPct)).toBe("39.67");
  });

  // ============================================================
  // T16 — base da comissão inclui o frete (cliente, 18/08/2026)
  // ------------------------------------------------------------
  // Regra nova. Até 18/08/2026 a comissão saía só sobre a receita dos itens,
  // como o Calculations.md §6/§7.4 descrevia a partir da planilha antiga. A
  // planilha Rentabilidade 2026 passou a somar o frete na base, e o cliente
  // confirmou que vale para TODOS os canais.
  //
  // Este teste existe para que a regra não se perca: se alguém voltar a
  // comissionar só a receita, ele quebra aqui e não em produção, no
  // contracheque do vendedor.
  // ============================================================

  it("T16 — comissão sai sobre receita + frete informado", () => {
    const r = calcularPedido({
      itens: [itemAvental],
      frete: "1000",
      aliquotaImposto: "0.1625",
      aliquotaDifal: "0.135",
      aliquotaComissao: "0.025",
    });

    // 2,5% × (16.800 + 1.000) = 445,00 — e não 420,00 (2,5% × 16.800).
    esperarProximo(r.baseComissao, "17800");
    esperarProximo(r.comissao, "445");
  });

  it("T16b — frete por conta do cliente NÃO reduz a base da comissão", () => {
    // O frete deixa de ser dedução do resultado, mas o transporte foi vendido:
    // a base da comissão segue o frete INFORMADO, como na planilha.
    const r = calcularPedido({
      itens: [itemAvental],
      frete: "1000",
      fretePorContaCliente: true,
      aliquotaImposto: "0.1625",
      aliquotaDifal: "0.135",
      aliquotaComissao: "0.025",
    });

    esperarProximo(r.frete, "0");
    esperarProximo(r.baseComissao, "17800");
    esperarProximo(r.comissao, "445");
  });

  it("T16c — sem frete, a base da comissão é a receita pura", () => {
    const r = calcularPedido({
      itens: [itemAvental],
      frete: "0",
      aliquotaImposto: "0.1625",
      aliquotaDifal: "0.135",
      aliquotaComissao: "0.025",
    });

    esperarProximo(r.baseComissao, "16800");
    esperarProximo(r.comissao, "420");
  });

  it("T16d — a regra vale para qualquer alíquota, inclusive Externos 6,1%", () => {
    const r = calcularPedido({
      itens: [itemAvental],
      frete: "1000",
      aliquotaImposto: "0.1625",
      aliquotaDifal: "0.135",
      aliquotaComissao: "0.061",
    });

    esperarProximo(r.comissao, "1085.80"); // 6,1% × 17.800
  });

  it("T15 — prejuízo nunca devolve percentual positivo", () => {
    // Os números do pedido real que revelou o defeito.
    const pct = margemPct(dec("-320.85"), dec("-217.50"));
    expect(pct.isNegative()).toBe(true);
    expect(toPercent(pct)).toBe("-147.52");
  });
});
