import { describe, expect, it } from "vitest";
import {
  KIT_NOVO,
  montarItensDaCotacao,
  montarItensParaMotor,
  resolverKitAdHocDoPedido,
  resolverLinhaDoPedido,
  type ItemVendavelResumo,
  type LinhaItem,
} from "@app/lib/sim/itensDoPedido";
import type { CatalogoParaKit } from "@app/lib/sim/kitNoPedido";
import { assinaturaKitCompleta, type CustoProdutoKit } from "@calc";

// ============================================================
// Da linha da tela para o item do pedido
// ============================================================
//
// É aqui que a escolha do vendedor vira dado: produto de catálogo, kit de
// catálogo, ou kit montado na hora. Um erro nesta tradução não aparece na
// tela — aparece no pedido gravado, e só depois de ganho.

const CATALOGO: ItemVendavelResumo[] = [
  { tipo: "produto", id: "prod-avental", nome: "Avental TNT 40g", cmvUnitario: "1.537605" },
  { tipo: "produto", id: "prod-campo", nome: "Campo Cirúrgico Catarata", cmvUnitario: "2.9354" },
  { tipo: "produto", id: "prod-sem-custo", nome: "Produto sem ficha técnica", cmvUnitario: null },
  { tipo: "kit", id: "kit-catarata", nome: "[Kit] Kit Catarata", cmvUnitario: "6.52863" },
];

const custoPorProduto = new Map<string, CustoProdutoKit>([
  ["prod-avental", { cmv: "1.537605" }],
  ["prod-campo", { cmv: "2.935400" }],
]);

const insumoPorId = new Map([
  ["ins-envelope", { nome: "Envelope 25x30", precoSemImposto: "0.51802", maoDeObra: false }],
  ["ins-caixa", { nome: "Caixa de esterilização", precoSemImposto: "0.066542", maoDeObra: false }],
]);

// Kit já cadastrado: 2 aventais + 1 campo, num envelope.
const COMPOSICAO_EXISTENTE = [
  { produtoId: "prod-avental", quantidade: "2" },
  { produtoId: "prod-campo", quantidade: "1" },
];
const ASSINATURA_EXISTENTE = assinaturaKitCompleta(COMPOSICAO_EXISTENTE, [
  { insumoId: "ins-envelope", quantidade: { tipo: "direta", quantidade: "1" } },
]);

function catalogoDeKit(
  kits: CatalogoParaKit["kitPorAssinatura"] = new Map()
): CatalogoParaKit {
  return { custoPorProduto, insumoPorId, kitPorAssinatura: kits };
}

const KITS_CADASTRADOS: CatalogoParaKit["kitPorAssinatura"] = new Map([
  [ASSINATURA_EXISTENTE, { id: "kit-catarata", codigo: "KC0001", nome: "Kit Catarata", ativo: true }],
]);

function linha(p: Partial<LinhaItem> = {}): LinhaItem {
  return { itemId: "", quantidade: "1", preco: "", kitNovo: null, ...p };
}

function kitNovo(produtos = COMPOSICAO_EXISTENTE, embalagem: LinhaItem["kitNovo"] extends null ? never : NonNullable<LinhaItem["kitNovo"]>["embalagem"] = []) {
  return {
    rotulo: "Kit catarata Hospital X",
    produtos: produtos.map((p) => ({ produtoId: p.produtoId, quantidade: p.quantidade })),
    embalagem,
  };
}

describe("resolver a linha escolhida pelo vendedor", () => {
  it("produto de catálogo devolve nome e CMV vigente", () => {
    const r = resolverLinhaDoPedido(linha({ itemId: "prod-avental" }), CATALOGO, catalogoDeKit());
    expect(r).toEqual({
      nome: "Avental TNT 40g",
      cmvUnitario: "1.537605",
      assinatura: null,
      kitExistente: null,
      erro: null,
      linhasProdutos: [],
      linhasEmbalagem: [],
    });
  });

  it("kit de catálogo é resolvido como item comum, sem assinatura", () => {
    const r = resolverLinhaDoPedido(linha({ itemId: "kit-catarata" }), CATALOGO, catalogoDeKit());
    expect(r?.nome).toBe("[Kit] Kit Catarata");
    expect(r?.cmvUnitario).toBe("6.52863");
    expect(r?.assinatura).toBeNull();
  });

  it("produto sem custo vigente resolve com CMV nulo — nunca zero silencioso", () => {
    const r = resolverLinhaDoPedido(linha({ itemId: "prod-sem-custo" }), CATALOGO, catalogoDeKit());
    expect(r?.cmvUnitario).toBeNull();
    expect(r?.erro).toBeNull(); // quem barra é o motor, com o nome do item
  });

  it("linha em branco não resolve nada", () => {
    expect(resolverLinhaDoPedido(linha(), CATALOGO, catalogoDeKit())).toBeNull();
  });

  it("item que sumiu do catálogo (desativado entre carregar e escolher) não resolve", () => {
    const r = resolverLinhaDoPedido(linha({ itemId: "prod-que-nao-existe" }), CATALOGO, catalogoDeKit());
    expect(r).toBeNull();
  });

  it("kit montado na hora traz CMV, assinatura e o rótulo dado pelo vendedor", () => {
    const r = resolverLinhaDoPedido(
      linha({ itemId: KIT_NOVO, kitNovo: kitNovo(COMPOSICAO_EXISTENTE, [{ insumoId: "ins-envelope", modo: "porKit", quantidade: "1" }]) }),
      CATALOGO,
      catalogoDeKit()
    );
    expect(r?.nome).toBe("Kit catarata Hospital X");
    // 2 × 1,537605 + 1 × 2,935400 + 1 envelope 0,51802
    expect(r?.cmvUnitario).toBe("6.52863");
    expect(r?.assinatura).toBe(ASSINATURA_EXISTENTE);
    expect(r?.kitExistente).toBeNull();
  });

  it("kit montado sem rótulo ganha um nome padrão, nunca vazio", () => {
    const r = resolverLinhaDoPedido(
      linha({ itemId: KIT_NOVO, kitNovo: { ...kitNovo(), rotulo: "   " } }),
      CATALOGO,
      catalogoDeKit()
    );
    expect(r?.nome).toBe("Kit montado no pedido");
  });
});

describe("itens que vão para o motor de cálculo", () => {
  it("sem quantidade ou sem preço, a cotação está incompleta — não calcula pela metade", () => {
    const linhas = [linha({ itemId: "prod-avental", preco: "" })];
    const resolvidas = linhas.map((l) => resolverLinhaDoPedido(l, CATALOGO, catalogoDeKit()));
    expect(montarItensParaMotor(linhas, resolvidas).estado).toBe("incompleto");
  });

  it("linha incompleta não derruba as outras — ela só não entra", () => {
    const linhas = [
      linha({ itemId: "prod-avental", quantidade: "100", preco: "4.20" }),
      linha({ itemId: "prod-campo", quantidade: "50", preco: "" }), // ainda sendo digitada
    ];
    const resolvidas = linhas.map((l) => resolverLinhaDoPedido(l, CATALOGO, catalogoDeKit()));
    const r = montarItensParaMotor(linhas, resolvidas);
    expect(r.estado).toBe("ok");
    expect(r.estado === "ok" && r.itens).toHaveLength(1);
  });

  it("kit montado sem nenhum produto bloqueia o pedido inteiro", () => {
    const linhas = [
      linha({ itemId: "prod-avental", quantidade: "100", preco: "4.20" }),
      linha({ itemId: KIT_NOVO, quantidade: "10", preco: "30", kitNovo: { rotulo: "", produtos: [], embalagem: [] } }),
    ];
    const resolvidas = linhas.map((l) => resolverLinhaDoPedido(l, CATALOGO, catalogoDeKit()));
    const r = montarItensParaMotor(linhas, resolvidas);
    expect(r.estado).toBe("bloqueado");
    expect(r.estado === "bloqueado" && r.msg).toBe("Inclua ao menos um produto no kit.");
  });

  it("aceita vírgula decimal e separador de milhar do teclado brasileiro", () => {
    // 4.000 unidades é o caso normal aqui (fixture Patricia). Antes, "4.000,5"
    // virava "4.000.5" e a tela só dizia "não foi possível calcular".
    const linhas = [linha({ itemId: "prod-avental", quantidade: "4.000,5", preco: "4,20" })];
    const resolvidas = linhas.map((l) => resolverLinhaDoPedido(l, CATALOGO, catalogoDeKit()));
    const r = montarItensParaMotor(linhas, resolvidas);
    expect(r.estado === "ok" && r.itens[0].quantidade).toBe("4000.5");
    expect(r.estado === "ok" && r.itens[0].precoVenda).toBe("4.20");
  });

  it("ponto sozinho continua sendo casa decimal — é assim que o valor volta do banco", () => {
    const linhas = [linha({ itemId: "prod-avental", quantidade: "2.5", preco: "4.20" })];
    const resolvidas = linhas.map((l) => resolverLinhaDoPedido(l, CATALOGO, catalogoDeKit()));
    const r = montarItensParaMotor(linhas, resolvidas);
    expect(r.estado === "ok" && r.itens[0].quantidade).toBe("2.5");
  });

  it("produto sem custo entra com CMV 0 para o MOTOR barrar com o nome do item (T9)", () => {
    const linhas = [linha({ itemId: "prod-sem-custo", quantidade: "10", preco: "5" })];
    const resolvidas = linhas.map((l) => resolverLinhaDoPedido(l, CATALOGO, catalogoDeKit()));
    const r = montarItensParaMotor(linhas, resolvidas);
    expect(r.estado === "ok" && r.itens[0].cmvUnitario).toBe("0");
    expect(r.estado === "ok" && r.itens[0].nome).toBe("Produto sem ficha técnica");
  });
});

describe("itens gravados na cotação", () => {
  it("produto vira item de produto; kit de catálogo vira item de kit", () => {
    const linhas = [
      linha({ itemId: "prod-avental", quantidade: "100", preco: "4.20" }),
      linha({ itemId: "kit-catarata", quantidade: "10", preco: "30" }),
    ];
    const resolvidas = linhas.map((l) => resolverLinhaDoPedido(l, CATALOGO, catalogoDeKit()));
    expect(montarItensDaCotacao(linhas, resolvidas, CATALOGO)).toEqual([
      { tipo: "produto", refId: "prod-avental", quantidade: "100", precoVenda: "4.20" },
      { tipo: "kit", refId: "kit-catarata", quantidade: "10", precoVenda: "30" },
    ]);
  });

  it("composição inédita vira kitNovo, com assinatura, rótulo e embalagem normalizados", () => {
    const linhas = [
      linha({
        itemId: KIT_NOVO,
        quantidade: "10",
        preco: "30",
        kitNovo: kitNovo(COMPOSICAO_EXISTENTE, [
          { insumoId: "ins-envelope", modo: "porKit", quantidade: "1" },
          { insumoId: "ins-caixa", modo: "itensPorCaixa", quantidade: "12" },
        ]),
      }),
    ];
    const resolvidas = linhas.map((l) => resolverLinhaDoPedido(l, CATALOGO, catalogoDeKit()));
    const itens = montarItensDaCotacao(linhas, resolvidas, CATALOGO);

    expect(itens).toHaveLength(1);
    expect(itens[0].tipo).toBe("kitNovo");
    expect(itens[0].refId).toBe("");
    expect(itens[0].kitNovo?.rotulo).toBe("Kit catarata Hospital X");
    expect(itens[0].kitNovo?.composicao).toEqual([
      { produtoId: "prod-avental", quantidade: "2" },
      { produtoId: "prod-campo", quantidade: "1" },
    ]);
    expect(itens[0].kitNovo?.embalagem).toEqual([
      { insumoId: "ins-envelope", modo: "porKit", quantidade: "1" },
      { insumoId: "ins-caixa", modo: "itensPorCaixa", quantidade: "12" },
    ]);
  });

  it("composição que JÁ existe grava o kit de catálogo — não cria um segundo código", () => {
    const linhas = [
      linha({
        itemId: KIT_NOVO,
        quantidade: "10",
        preco: "30",
        kitNovo: kitNovo(COMPOSICAO_EXISTENTE, [{ insumoId: "ins-envelope", modo: "porKit", quantidade: "1" }]),
      }),
    ];
    const resolvidas = linhas.map((l) => resolverLinhaDoPedido(l, CATALOGO, catalogoDeKit(KITS_CADASTRADOS)));

    expect(resolvidas[0]?.kitExistente).toEqual({
      id: "kit-catarata",
      codigo: "KC0001",
      nome: "Kit Catarata",
      ativo: true,
    });
    expect(montarItensDaCotacao(linhas, resolvidas, CATALOGO)).toEqual([
      { tipo: "kit", refId: "kit-catarata", quantidade: "10", precoVenda: "30" },
    ]);
  });

  it("linhas em branco dentro do kit não são gravadas", () => {
    const linhas = [
      linha({
        itemId: KIT_NOVO,
        quantidade: "10",
        preco: "30",
        kitNovo: {
          rotulo: "Kit com sobras de digitação",
          produtos: [
            { produtoId: "prod-avental", quantidade: "2" },
            { produtoId: "", quantidade: "1" },
            { produtoId: "prod-campo", quantidade: "" },
          ],
          embalagem: [{ insumoId: "", modo: "porKit", quantidade: "1" }],
        },
      }),
    ];
    const resolvidas = linhas.map((l) => resolverLinhaDoPedido(l, CATALOGO, catalogoDeKit()));
    const itens = montarItensDaCotacao(linhas, resolvidas, CATALOGO);
    expect(itens[0].kitNovo?.composicao).toEqual([{ produtoId: "prod-avental", quantidade: "2" }]);
    expect(itens[0].kitNovo?.embalagem).toEqual([]);
  });

  it("vírgula decimal chega ao banco como ponto, inclusive dentro do kit", () => {
    const linhas = [
      linha({
        itemId: KIT_NOVO,
        quantidade: "10",
        preco: "30",
        kitNovo: kitNovo([{ produtoId: "prod-avental", quantidade: "1,5" }], [
          { insumoId: "ins-caixa", modo: "itensPorCaixa", quantidade: "12,5" },
        ]),
      }),
    ];
    const resolvidas = linhas.map((l) => resolverLinhaDoPedido(l, CATALOGO, catalogoDeKit()));
    const itens = montarItensDaCotacao(linhas, resolvidas, CATALOGO);
    expect(itens[0].kitNovo?.composicao[0].quantidade).toBe("1.5");
    expect(itens[0].kitNovo?.embalagem[0].quantidade).toBe("12.5");
  });
});

describe("kit montado no pedido, lido de fora do simulador", () => {
  // Entre salvar a cotação e ganhar o pedido o kit não existe em `kits`: mora
  // nas colunas ad_hoc_* do item. Quem aprova, quem imprime a ficha e o
  // fechamento leem por aqui.
  const nomePorProduto = new Map([
    ["prod-avental", "Avental TNT 40g"],
    ["prod-campo", "Campo Cirúrgico Catarata"],
  ]);

  const itemGravado = {
    ad_hoc_kit_composition: [
      { product_id: "prod-avental", quantity: "2" },
      { product_id: "prod-campo", quantity: "1" },
    ],
    ad_hoc_kit_packaging: [
      { input_id: "ins-envelope", quantity_type: "direct" as const, quantity: "1", lot_size: null },
    ],
    ad_hoc_kit_label: "Kit catarata Hospital X",
  };

  it("devolve o mesmo CMV que o simulador mostrou ao vendedor", () => {
    const r = resolverKitAdHocDoPedido(itemGravado, catalogoDeKit(), nomePorProduto);
    expect(r.cmvUnitario).toBe("6.52863");
    expect(r.nome).toBe("Kit catarata Hospital X");
  });

  it("expande a composição com o NOME de cada produto — é o que a ficha imprime", () => {
    const r = resolverKitAdHocDoPedido(itemGravado, catalogoDeKit(), nomePorProduto);
    expect(r.composicao).toEqual([
      { produtoId: "prod-avental", nome: "Avental TNT 40g", quantidade: "2", cmvUnitario: "1.537605" },
      { produtoId: "prod-campo", nome: "Campo Cirúrgico Catarata", quantidade: "1", cmvUnitario: "2.9354" },
    ]);
  });

  it("a caixa de esterilização gravada como lote volta rateada, não inteira", () => {
    const r = resolverKitAdHocDoPedido(
      {
        ...itemGravado,
        ad_hoc_kit_packaging: [
          { input_id: "ins-caixa", quantity_type: "lot", quantity: null, lot_size: "10" },
        ],
      },
      catalogoDeKit(),
      nomePorProduto
    );
    // produtos 6,010610 + caixa 0,066542 ÷ 10
    expect(Number(r.cmvUnitario)).toBeCloseTo(6.0172642, 7);
  });

  it("produto do kit sem custo vigente devolve CMV nulo — o motor barra depois", () => {
    const r = resolverKitAdHocDoPedido(
      {
        ad_hoc_kit_composition: [{ product_id: "prod-sem-custo", quantity: "1" }],
        ad_hoc_kit_packaging: null,
        ad_hoc_kit_label: null,
      },
      catalogoDeKit(),
      nomePorProduto
    );
    expect(r.cmvUnitario).toBeNull();
    expect(r.nome).toBe("Kit montado no pedido");
    // Mesmo sem custo, a composição continua descrita: quem lê o pedido
    // precisa ver o que tem dentro do kit para entender o bloqueio.
    expect(r.composicao).toEqual([
      { produtoId: "prod-sem-custo", nome: "prod-sem-custo", quantidade: "1", cmvUnitario: "0" },
    ]);
  });
});
