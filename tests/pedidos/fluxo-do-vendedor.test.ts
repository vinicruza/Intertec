import { describe, expect, it } from "vitest";
import { ErroCalculoBloqueante, assinaturaKitCompleta, dec, toMoney, toPercent, type CustoProdutoKit } from "@calc";
import {
  KIT_NOVO,
  montarItensDaCotacao,
  montarItensParaMotor,
  resolverKitAdHocDoPedido,
  resolverLinhaDoPedido,
  type ItemVendavelResumo,
  type LinhaItem,
  type LinhaResolvida,
} from "@app/lib/sim/itensDoPedido";
import type { CatalogoParaKit } from "@app/lib/sim/kitNoPedido";
import { montarSnapshot } from "@app/lib/sim/snapshot";
import { simular, statusMargem, type CanalRegras, type RegraMargem, type TabelasUF } from "@app/lib/sim/params";

// ============================================================
// O caminho inteiro do vendedor, ponta a ponta
// ============================================================
//
// Cada teste daqui é um pedido do começo ao fim, como a pessoa faz na tela:
// escolhe vendedor e UF, monta as linhas (produto, kit de catálogo, kit novo),
// vê a cascata, grava a cotação e — quando ganha — congela o snapshot.
//
// Os testes de unidade de cada peça estão em itensDoPedido.test.ts,
// kitNoPedido.test.ts e fixture-patricia.test.ts. Este arquivo existe para
// pegar o que só aparece quando as peças se encaixam: um kit que já existe e
// não pode ganhar código novo, um kit montado na hora que precisa chegar
// inteiro em quem aprova, um custo faltando que não pode virar zero.

// ---------- Catálogo de teste (números reais da Intertech) ----------

const AVENTAL = "prod-avental";
const CAMPO = "prod-campo";
const COMPRESSA = "prod-compressa";
const SEM_CUSTO = "prod-sem-custo";
const ENVELOPE = "ins-envelope";
const CAIXA = "ins-caixa";

const CMV = {
  avental: "1.537605",
  campo: "2.935400",
  compressa: "0.412000",
} as const;

const custoPorProduto = new Map<string, CustoProdutoKit>([
  [AVENTAL, { cmv: CMV.avental }],
  [CAMPO, { cmv: CMV.campo }],
  [COMPRESSA, { cmv: CMV.compressa }],
]);

const insumoPorId = new Map([
  [ENVELOPE, { nome: "Envelope 25x30", precoSemImposto: "0.51802", maoDeObra: false }],
  [CAIXA, { nome: "Caixa de esterilização", precoSemImposto: "0.066542", maoDeObra: false }],
]);

const nomePorProduto = new Map([
  [AVENTAL, "Avental TNT 40g"],
  [CAMPO, "Campo Cirúrgico Catarata"],
  [COMPRESSA, "Compressa Cirúrgica"],
]);

// Kit já no catálogo: 2 aventais + 1 campo, num envelope. Código KC0001.
const COMPOSICAO_KC0001 = [
  { produtoId: AVENTAL, quantidade: "2" },
  { produtoId: CAMPO, quantidade: "1" },
];
const EMBALAGEM_KC0001 = [{ insumoId: ENVELOPE, modo: "porKit" as const, quantidade: "1" }];
const ASSINATURA_KC0001 = assinaturaKitCompleta(COMPOSICAO_KC0001, [
  { insumoId: ENVELOPE, quantidade: { tipo: "direta", quantidade: "1" } },
]);
const CMV_KC0001 = "6.52863"; // 2×1,537605 + 2,9354 + 0,51802

const ITENS_VENDAVEIS: ItemVendavelResumo[] = [
  { tipo: "produto", id: AVENTAL, nome: "Avental TNT 40g", cmvUnitario: CMV.avental },
  { tipo: "produto", id: CAMPO, nome: "Campo Cirúrgico Catarata", cmvUnitario: CMV.campo },
  { tipo: "produto", id: COMPRESSA, nome: "Compressa Cirúrgica", cmvUnitario: CMV.compressa },
  { tipo: "produto", id: SEM_CUSTO, nome: "Produto sem ficha técnica", cmvUnitario: null },
  { tipo: "kit", id: "kit-KC0001", nome: "[Kit] Kit Catarata", cmvUnitario: CMV_KC0001 },
];

function catalogo(kitsCadastrados: CatalogoParaKit["kitPorAssinatura"] = new Map()): CatalogoParaKit {
  return { custoPorProduto, insumoPorId, kitPorAssinatura: kitsCadastrados };
}

const KITS_DO_CATALOGO: CatalogoParaKit["kitPorAssinatura"] = new Map([
  [ASSINATURA_KC0001, { id: "kit-KC0001", codigo: "KC0001", nome: "Kit Catarata", ativo: true }],
]);

// ---------- Parâmetros do pedido ----------

const CANAL_INTERNO: CanalRegras = { aplicaDifal: true, comissaoPadrao: "0.025", modeloFrete: "manual" };
const CANAL_REVENDAS: CanalRegras = { aplicaDifal: false, comissaoPadrao: "0.025", modeloFrete: "manual" };
const BA: TabelasUF = { aliquotaIcsm: "0.1625", difalFinal: "0.135", fretePortalPct: "0.17" };

const REGRAS_MARGEM: RegraMargem[] = [
  { label: "Boa", min_rate: "0.40", max_rate: null, color: "green", sort_order: 1 },
  { label: "Atenção", min_rate: "0.25", max_rate: "0.40", color: "yellow", sort_order: 2 },
  { label: "Crítica", min_rate: "0.10", max_rate: "0.25", color: "orange", sort_order: 3 },
  { label: "Negativa", min_rate: null, max_rate: "0.10", color: "red", sort_order: 4 },
];

// ---------- O pedido, do jeito que a tela faz ----------

type Pedido = {
  linhas: LinhaItem[];
  kitsCadastrados?: CatalogoParaKit["kitPorAssinatura"];
  frete?: string;
  fretePorContaCliente?: boolean;
  comissao?: string | null;
  aplicaDifal?: boolean | null;
  canal?: CanalRegras;
};

function montarPedido(p: Pedido) {
  const cat = catalogo(p.kitsCadastrados ?? new Map());
  const resolvidas: Array<LinhaResolvida | null> = p.linhas.map((l) =>
    resolverLinhaDoPedido(l, ITENS_VENDAVEIS, cat)
  );
  const paraMotor = montarItensParaMotor(p.linhas, resolvidas);
  const itensBaseDaCotacao = montarItensDaCotacao(p.linhas, resolvidas, ITENS_VENDAVEIS);

  // A tela chama o motor dentro de um try: erro bloqueante vira mensagem
  // vermelha, não tela quebrada. Aqui é igual, para o teste poder olhar os
  // dois lados — a cascata quando dá certo, a mensagem quando não dá.
  const calcular = () =>
    simular({
      itens: paraMotor.estado === "ok" ? paraMotor.itens : [],
      freteManual: p.frete ?? "0",
      fretePorContaCliente: p.fretePorContaCliente ?? false,
      comissao: p.comissao ?? null,
      aplicaDifal: p.aplicaDifal ?? null,
      canal: p.canal ?? CANAL_INTERNO,
      uf: BA,
    });

  let simulacao = null;
  let erroDoMotor: unknown = null;
  if (paraMotor.estado === "ok") {
    try {
      simulacao = calcular();
    } catch (e) {
      erroDoMotor = e;
    }
  }

  const itensDaCotacao = itensBaseDaCotacao;

  return { resolvidas, paraMotor, itensDaCotacao, simulacao, erroDoMotor, calcular };
}

function linha(p: Partial<LinhaItem>): LinhaItem {
  return { itemId: "", quantidade: "1", preco: "", kitNovo: null, ...p };
}

describe("pedido só com produtos individuais", () => {
  const pedido = montarPedido({
    linhas: [
      linha({ itemId: AVENTAL, quantidade: "4000", preco: "4,20" }),
      linha({ itemId: COMPRESSA, quantidade: "500", preco: "1,50" }),
    ],
    frete: "1000",
  });

  it("calcula a cascata e classifica a margem", () => {
    const s = pedido.simulacao!;
    expect(toMoney(s.resultado.receitaBruta)).toBe("17550.00"); // 16.800 + 750
    expect(toMoney(s.resultado.imposto)).toBe("2851.88"); // 16,25%
    expect(toMoney(s.resultado.difal)).toBe("2504.25"); // 13,5% × (17.550 + 1.000 de frete)
    expect(toMoney(s.resultado.comissao)).toBe("463.75"); // 2,5% × (17.550 + 1.000 de frete)
    // Frete desmarcado = a Intertec paga o transporte: sai do resultado e não
    // é tributado (regra do Bryan, 19/08/2026 — golden T14c).
    expect(toMoney(s.resultado.frete)).toBe("1000.00");
    expect(toMoney(s.resultado.impostoFrete)).toBe("0.00");
    expect(toMoney(s.resultado.receitaLiquida)).toBe("10730.13");
    // CMV: 4000 × 1,537605 + 500 × 0,412
    expect(toMoney(s.resultado.cmvTotal)).toBe("6356.42");
    expect(toMoney(s.resultado.margemContribuicao)).toBe("4373.71");
    expect(toPercent(s.resultado.margemContribuicaoPct)).toBe("40.76");
    expect(statusMargem(s.resultado.margemContribuicaoPct, REGRAS_MARGEM)?.label).toBe("Boa");
  });

  it("grava um item por linha, com o id do produto", () => {
    expect(pedido.itensDaCotacao).toEqual([
      { tipo: "produto", refId: AVENTAL, quantidade: "4000", precoVenda: "4,20" },
      { tipo: "produto", refId: COMPRESSA, quantidade: "500", precoVenda: "1,50" },
    ]);
  });

  it("o preço vai para o banco com ponto decimal, não com vírgula", () => {
    // A conversão acontece na gravação (salvarCotacao); o que importa aqui é
    // que o motor já leu o mesmo número que o banco vai receber.
    expect(pedido.paraMotor.estado === "ok" && pedido.paraMotor.itens[0].precoVenda).toBe("4.20");
  });
});

describe("pedido com kit do catálogo", () => {
  it("usa o CMV do kit inteiro, sem somar produto a produto", () => {
    const pedido = montarPedido({
      linhas: [linha({ itemId: "kit-KC0001", quantidade: "100", preco: "25" })],
      frete: "200",
    });
    const s = pedido.simulacao!;
    expect(toMoney(s.resultado.cmvTotal)).toBe("652.86"); // 100 × 6,52863
    expect(pedido.itensDaCotacao).toEqual([
      { tipo: "kit", refId: "kit-KC0001", quantidade: "100", precoVenda: "25" },
    ]);
  });
});

describe("pedido com kit montado na hora", () => {
  const kitNovoDaTela = {
    rotulo: "Kit catarata Hospital de Manaus",
    produtos: [
      { produtoId: AVENTAL, quantidade: "2" },
      { produtoId: CAMPO, quantidade: "1" },
      { produtoId: COMPRESSA, quantidade: "4" },
    ],
    embalagem: [
      { insumoId: ENVELOPE, modo: "porKit" as const, quantidade: "1" },
      { insumoId: CAIXA, modo: "itensPorCaixa" as const, quantidade: "12" },
    ],
  };

  const pedido = montarPedido({
    linhas: [linha({ itemId: KIT_NOVO, quantidade: "100", preco: "25", kitNovo: kitNovoDaTela })],
    kitsCadastrados: KITS_DO_CATALOGO,
    frete: "200",
  });

  it("mostra o CMV do kit somando produtos + embalagem consumida uma vez por kit", () => {
    const r = pedido.resolvidas[0]!;
    // produtos: 2×1,537605 + 2,9354 + 4×0,412 = 7,65861
    // embalagem: envelope 0,51802 + caixa 0,066542÷12 = 0,523565…
    expect(Number(r.cmvUnitario)).toBeCloseTo(8.182175, 6);
    expect(r.erro).toBeNull();
  });

  it("não confunde com o kit de catálogo parecido — a composição é outra", () => {
    expect(pedido.resolvidas[0]!.kitExistente).toBeNull();
    expect(pedido.resolvidas[0]!.assinatura).not.toBe(ASSINATURA_KC0001);
  });

  it("mostra o peso de cada item no custo do kit, somando 100%", () => {
    const r = pedido.resolvidas[0]!;
    const soma = [...r.linhasProdutos, ...r.linhasEmbalagem].reduce(
      (s, l) => s + Number(l.participacao),
      0
    );
    expect(soma).toBeCloseTo(1, 8);
    // Quem mais pesa é o avental — não porque é o mais caro por unidade (o
    // campo é), mas porque entram DOIS por kit. É exatamente a pergunta que o
    // cliente queria responder em 30/07/2026.
    const maior = [...r.linhasProdutos].sort((a, b) => Number(b.participacao) - Number(a.participacao))[0];
    expect(maior.produtoId).toBe(AVENTAL);
    expect(Number(maior.participacao)).toBeCloseTo(3.07521 / 8.182175, 6);
  });

  it("grava como kitNovo — o código oficial só nasce quando o pedido é ganho", () => {
    const item = pedido.itensDaCotacao[0];
    expect(item.tipo).toBe("kitNovo");
    expect(item.refId).toBe("");
    expect(item.kitNovo?.assinatura).toBe(pedido.resolvidas[0]!.assinatura);
    expect(item.kitNovo?.rotulo).toBe("Kit catarata Hospital de Manaus");
    expect(item.kitNovo?.embalagem).toEqual(kitNovoDaTela.embalagem);
  });

  it("a caixa de esterilização entra rateada, não inteira em cada kit", () => {
    const inteira = montarPedido({
      linhas: [linha({
        itemId: KIT_NOVO,
        quantidade: "100",
        preco: "25",
        kitNovo: { ...kitNovoDaTela, embalagem: [{ insumoId: CAIXA, modo: "porKit", quantidade: "1" }] },
      })],
    });
    const rateada = montarPedido({
      linhas: [linha({
        itemId: KIT_NOVO,
        quantidade: "100",
        preco: "25",
        kitNovo: { ...kitNovoDaTela, embalagem: [{ insumoId: CAIXA, modo: "itensPorCaixa", quantidade: "12" }] },
      })],
    });
    // A caixa inteira custa 12× o que custa rateada por 12 kits.
    const diferenca = Number(inteira.resolvidas[0]!.cmvUnitario) - Number(rateada.resolvidas[0]!.cmvUnitario);
    expect(diferenca).toBeCloseTo(0.066542 * (1 - 1 / 12), 8);
    // E são kits DIFERENTES: custo diferente, identidade diferente.
    expect(inteira.resolvidas[0]!.assinatura).not.toBe(rateada.resolvidas[0]!.assinatura);
  });
});

describe("kit montado na hora cuja composição JÁ existe", () => {
  // Pedido explícito da reunião de 16/07/2026: "a hora que ela jogar ali, o
  // próprio sistema acusasse que aquele kit já existe".

  it("avisa o vendedor com o CÓDIGO do kit, não só com o nome", () => {
    const pedido = montarPedido({
      linhas: [linha({
        itemId: KIT_NOVO,
        quantidade: "100",
        preco: "25",
        kitNovo: { rotulo: "Kit catarata do Hospital X", produtos: COMPOSICAO_KC0001, embalagem: EMBALAGEM_KC0001 },
      })],
      kitsCadastrados: KITS_DO_CATALOGO,
    });

    expect(pedido.resolvidas[0]!.kitExistente).toEqual({
      id: "kit-KC0001",
      codigo: "KC0001",
      nome: "Kit Catarata",
      ativo: true,
    });
  });

  it("reconhece a composição mesmo montada em outra ordem", () => {
    const invertida = montarPedido({
      linhas: [linha({
        itemId: KIT_NOVO,
        quantidade: "100",
        preco: "25",
        kitNovo: {
          rotulo: "",
          produtos: [
            { produtoId: CAMPO, quantidade: "1" },
            { produtoId: AVENTAL, quantidade: "2" },
          ],
          embalagem: EMBALAGEM_KC0001,
        },
      })],
      kitsCadastrados: KITS_DO_CATALOGO,
    });
    expect(invertida.resolvidas[0]!.kitExistente?.codigo).toBe("KC0001");
  });

  it("reconhece a composição digitada em duas linhas do mesmo produto (1 + 1 = 2)", () => {
    const somada = montarPedido({
      linhas: [linha({
        itemId: KIT_NOVO,
        quantidade: "100",
        preco: "25",
        kitNovo: {
          rotulo: "",
          produtos: [
            { produtoId: AVENTAL, quantidade: "1" },
            { produtoId: CAMPO, quantidade: "1" },
            { produtoId: AVENTAL, quantidade: "1" },
          ],
          embalagem: EMBALAGEM_KC0001,
        },
      })],
      kitsCadastrados: KITS_DO_CATALOGO,
    });
    expect(somada.resolvidas[0]!.kitExistente?.codigo).toBe("KC0001");
  });

  it("grava o kit que já existe — a mesma composição nunca ganha um segundo código", () => {
    const pedido = montarPedido({
      linhas: [linha({
        itemId: KIT_NOVO,
        quantidade: "100",
        preco: "25",
        kitNovo: { rotulo: "Kit catarata do Hospital X", produtos: COMPOSICAO_KC0001, embalagem: EMBALAGEM_KC0001 },
      })],
      kitsCadastrados: KITS_DO_CATALOGO,
    });
    expect(pedido.itensDaCotacao).toEqual([
      { tipo: "kit", refId: "kit-KC0001", quantidade: "100", precoVenda: "25" },
    ]);
  });

  it("avisa também quando o kit gêmeo está INATIVO — a assinatura é única de qualquer jeito", () => {
    const inativo: CatalogoParaKit["kitPorAssinatura"] = new Map([
      [ASSINATURA_KC0001, { id: "kit-KC0001", codigo: "KC0001", nome: "Kit Catarata", ativo: false }],
    ]);
    const pedido = montarPedido({
      linhas: [linha({
        itemId: KIT_NOVO,
        quantidade: "100",
        preco: "25",
        kitNovo: { rotulo: "", produtos: COMPOSICAO_KC0001, embalagem: EMBALAGEM_KC0001 },
      })],
      kitsCadastrados: inativo,
    });
    expect(pedido.resolvidas[0]!.kitExistente?.ativo).toBe(false);
    expect(pedido.resolvidas[0]!.kitExistente?.codigo).toBe("KC0001");
  });

  it("mudar só o número de caixas já é outro kit — o custo é outro", () => {
    const duasCaixas = montarPedido({
      linhas: [linha({
        itemId: KIT_NOVO,
        quantidade: "100",
        preco: "25",
        kitNovo: {
          rotulo: "",
          produtos: COMPOSICAO_KC0001,
          embalagem: [{ insumoId: ENVELOPE, modo: "porKit", quantidade: "2" }],
        },
      })],
      kitsCadastrados: KITS_DO_CATALOGO,
    });
    expect(duasCaixas.resolvidas[0]!.kitExistente).toBeNull();
  });
});

describe("o que o pedido do vendedor NÃO deixa passar", () => {
  it("produto sem custo vigente bloqueia o pedido, nomeando o item (T9)", () => {
    const pedido = montarPedido({
      linhas: [
        linha({ itemId: AVENTAL, quantidade: "100", preco: "4.20" }),
        linha({ itemId: SEM_CUSTO, quantidade: "10", preco: "9.90" }),
      ],
    });
    expect(pedido.paraMotor.estado).toBe("ok"); // o motor é quem barra
    expect(pedido.simulacao).toBeNull();
    expect(pedido.erroDoMotor).toBeInstanceOf(ErroCalculoBloqueante);
    expect((pedido.erroDoMotor as Error).message).toContain("Produto sem ficha técnica");
  });

  it("kit montado com produto sem custo também bloqueia — nunca CMV zero", () => {
    const pedido = montarPedido({
      linhas: [linha({
        itemId: KIT_NOVO,
        quantidade: "10",
        preco: "50",
        kitNovo: {
          rotulo: "Kit com produto sem ficha",
          produtos: [{ produtoId: SEM_CUSTO, quantidade: "1" }],
          embalagem: [],
        },
      })],
    });
    expect(pedido.resolvidas[0]!.cmvUnitario).toBeNull();
    expect(pedido.erroDoMotor).toBeInstanceOf(ErroCalculoBloqueante);
    // A mensagem cita o kit pelo rótulo que o vendedor deu — é assim que ele
    // sabe qual linha corrigir.
    expect((pedido.erroDoMotor as Error).message).toMatch(/Kit com produto sem ficha.*CMV zerado/);
  });

  it("pedido que dá prejuízo é classificado como Negativa, nunca como Boa", () => {
    // Preço abaixo do custo: a margem tem de ser negativa e a faixa também.
    // (Regressão do bug de sinal em margemPct — negativo ÷ negativo dava +.)
    const pedido = montarPedido({
      linhas: [linha({ itemId: AVENTAL, quantidade: "1000", preco: "1.00" })],
      frete: "3000",
    });
    const s = pedido.simulacao!;
    expect(s.resultado.margemContribuicao.isNegative()).toBe(true);
    expect(statusMargem(s.resultado.margemContribuicaoPct, REGRAS_MARGEM)?.label).toBe("Negativa");
  });
});

describe("escolhas do vendedor que mudam a conta", () => {
  const base: Pedido = {
    linhas: [linha({ itemId: AVENTAL, quantidade: "4000", preco: "4.20" })],
    frete: "1000",
  };

  it("frete destacado aparece separado na cascata sem inflar o preço unitário", () => {
    const pedido = montarPedido({ ...base, fretePorContaCliente: true });
    const s = pedido.simulacao!;
    expect(toMoney(s.freteUsado)).toBe("1000.00");
    expect(toMoney(s.resultado.impostoFrete)).toBe("162.50");
    expect(toMoney(dec(s.itensCalculados[0].precoVenda))).toBe("4.20");
    expect(toMoney(dec(pedido.itensDaCotacao[0].precoVenda))).toBe("4.20");
    // Receita bruta continua sendo só a venda; frete é uma dedução separada.
    const comFrete = montarPedido(base).simulacao!;
    expect(toMoney(s.resultado.receitaBruta)).toBe(toMoney(comFrete.resultado.receitaBruta));
    expect(toMoney(s.resultado.comissao)).toBe(toMoney(comFrete.resultado.comissao));
    expect(toMoney(s.resultado.frete)).toBe("0.00");
    expect(toMoney(s.resultado.receitaLiquida)).toBe("11059.50");
  });

  // Este teste dizia o contrário até 21/08/2026 ("frete desmarcado fica só na
  // expedição e não entra na margem"). Era a descrição do defeito: o simulador
  // mandava `fretePorContaCliente: true` fixo, então o frete nunca saía do
  // resultado — nem quando quem pagava o transporte era a Intertec. A planilha
  // sempre desceu o frete nesse caso (`N12 = 0`), e é ela que manda.
  it("frete desmarcado é custo da Intertec: sai do resultado e não é tributado", () => {
    const s = montarPedido(base).simulacao!;
    expect(toMoney(s.freteUsado)).toBe("1000.00");
    expect(toMoney(s.resultado.frete)).toBe("1000.00");
    expect(toMoney(s.resultado.impostoFrete)).toBe("0.00");
    // Marcar a caixa devolve os R$ 1.000 ao resultado, mas cobra os 162,50 de
    // imposto sobre o frete que passa a aparecer na nota: sobram 837,50.
    const destacado = montarPedido({ ...base, fretePorContaCliente: true }).simulacao!;
    expect(toMoney(destacado.resultado.impostoFrete)).toBe("162.50");
    expect(destacado.resultado.receitaLiquida.minus(s.resultado.receitaLiquida).toString()).toBe("837.5");
  });

  it("DIFAL desmarcado no pedido vale mais que o padrão do canal", () => {
    const s = montarPedido({ ...base, aplicaDifal: false }).simulacao!;
    expect(toMoney(s.resultado.difal)).toBe("0.00");
    expect(s.aplicaDifalUsado).toBe(false);
  });

  it("DIFAL marcado num canal que não aplica também vale — é decisão do pedido", () => {
    const s = montarPedido({ ...base, canal: CANAL_REVENDAS, aplicaDifal: true }).simulacao!;
    expect(toMoney(s.resultado.difal)).toBe("2403.00");
  });

  it("comissão digitada substitui a do canal", () => {
    const s = montarPedido({ ...base, comissao: "0.061" }).simulacao!;
    expect(toMoney(s.comissaoUsada.times(100))).toBe("6.10");
    expect(toMoney(s.resultado.comissao)).toBe("1085.80"); // 6,1% de 17.800 (receita + frete)
  });

  it("canal marketplace troca o frete digitado pelo percentual da UF", () => {
    const s = montarPedido({
      ...base,
      canal: { ...CANAL_INTERNO, modeloFrete: "uf_percent" },
    }).simulacao!;
    expect(toMoney(s.freteUsado)).toBe("2856.00"); // 17% de 16.800
  });
});

describe("do pedido salvo até o fechamento", () => {
  // Depois de salvar, o kit montado na hora vive nas colunas ad_hoc_* do item:
  // não tem product_id nem kit_id. Quem aprova, quem imprime a ficha e o
  // fechamento precisam enxergar o MESMO número que o vendedor viu.
  const itemGravadoNoBanco = {
    ad_hoc_kit_composition: [
      { product_id: AVENTAL, quantity: "2" },
      { product_id: CAMPO, quantity: "1" },
    ],
    ad_hoc_kit_packaging: [
      { input_id: ENVELOPE, quantity_type: "direct" as const, quantity: "1", lot_size: null },
    ],
    ad_hoc_kit_label: "Kit catarata Hospital de Manaus",
  };

  it("o kit montado na hora é reconstruído com o mesmo CMV, nome e composição", () => {
    const naTela = montarPedido({
      linhas: [linha({
        itemId: KIT_NOVO,
        quantidade: "100",
        preco: "25",
        kitNovo: {
          rotulo: "Kit catarata Hospital de Manaus",
          produtos: COMPOSICAO_KC0001,
          embalagem: EMBALAGEM_KC0001,
        },
      })],
    });

    const doBanco = resolverKitAdHocDoPedido(itemGravadoNoBanco, catalogo(), nomePorProduto);
    expect(doBanco.cmvUnitario).toBe(naTela.resolvidas[0]!.cmvUnitario);
    expect(doBanco.nome).toBe("Kit catarata Hospital de Manaus");
    expect(doBanco.composicao.map((c) => `${c.quantidade}× ${c.nome}`)).toEqual([
      "2× Avental TNT 40g",
      "1× Campo Cirúrgico Catarata",
    ]);
  });

  it("o snapshot do fechamento congela o que a tela mostrou", () => {
    const pedido = montarPedido({
      linhas: [linha({ itemId: AVENTAL, quantidade: "4000", preco: "4.20" })],
      frete: "1000",
    });
    const s = pedido.simulacao!;
    const snap = montarSnapshot(s, BA.aliquotaIcsm, [
      {
        orderItemId: "item-1",
        precoVenda: "4.20",
        quantidade: "4000",
        cmvUnitario: CMV.avental,
        despesaUnitaria: "0",
        composicaoKit: null,
      },
    ]);

    expect(snap.pedido.totals_display.receita_bruta).toBe(toMoney(s.resultado.receitaBruta));
    expect(snap.pedido.totals_display.margem_contribuicao).toBe(toMoney(s.resultado.margemContribuicao));
    expect(snap.itens[0].cmv_unit_snapshot).toBe(CMV.avental);
    expect(snap.itens[0].difal_rate_snapshot).toBe("0.135");
    expect(snap.itens[0].commission_rate_snapshot).toBe("0.025");
    // Item único: o frete inteiro é dele.
    expect(snap.itens[0].freight_share_snapshot).toBe("1000");
  });

  it("o snapshot do kit montado na hora leva a composição expandida, com nomes", () => {
    const doBanco = resolverKitAdHocDoPedido(itemGravadoNoBanco, catalogo(), nomePorProduto);
    const pedido = montarPedido({
      linhas: [linha({ itemId: "kit-KC0001", quantidade: "100", preco: "25" })],
    });
    const snap = montarSnapshot(pedido.simulacao!, BA.aliquotaIcsm, [
      {
        orderItemId: "item-1",
        precoVenda: "25",
        quantidade: "100",
        cmvUnitario: doBanco.cmvUnitario!,
        despesaUnitaria: "0",
        composicaoKit: doBanco.composicao,
      },
    ]);
    expect(snap.itens[0].kit_composition_snapshot).toEqual(doBanco.composicao);
  });
});

describe("pedido misto: produto, kit de catálogo e kit novo na mesma cotação", () => {
  const pedido = montarPedido({
    linhas: [
      linha({ itemId: AVENTAL, quantidade: "1000", preco: "4,20" }),
      linha({ itemId: "kit-KC0001", quantidade: "50", preco: "25,00" }),
      linha({
        itemId: KIT_NOVO,
        quantidade: "20",
        preco: "40,00",
        kitNovo: {
          rotulo: "Kit parto Hospital de Manaus",
          produtos: [
            { produtoId: CAMPO, quantidade: "2" },
            { produtoId: COMPRESSA, quantidade: "6" },
          ],
          embalagem: [{ insumoId: ENVELOPE, modo: "porKit", quantidade: "1" }],
        },
      }),
    ],
    kitsCadastrados: KITS_DO_CATALOGO,
    frete: "500",
  });

  it("as três naturezas de item convivem numa cotação só", () => {
    expect(pedido.itensDaCotacao.map((i) => i.tipo)).toEqual(["produto", "kit", "kitNovo"]);
  });

  it("a receita soma as três linhas", () => {
    // 1.000×4,20 + 50×25 + 20×40 = 4.200 + 1.250 + 800
    expect(toMoney(pedido.simulacao!.resultado.receitaBruta)).toBe("6250.00");
  });

  it("o CMV soma o custo de cada natureza pela sua própria regra", () => {
    // avental        1.000 × 1,537605                        = 1.537,605
    // kit catálogo      50 × 6,52863                          =   326,4315
    // kit novo          20 × (2×2,9354 + 6×0,412 + 0,51802)   =   177,2164
    expect(toMoney(pedido.simulacao!.resultado.cmvTotal)).toBe("2041.25");
  });

  it("a margem percentual bate com a cascata, e a faixa é a que a tela pinta", () => {
    const s = pedido.simulacao!;
    const pct = Number(s.resultado.margemContribuicao) / Number(s.resultado.receitaLiquida);
    expect(Number(toPercent(s.resultado.margemContribuicaoPct))).toBeCloseTo(pct * 100, 2);
    expect(statusMargem(s.resultado.margemContribuicaoPct, REGRAS_MARGEM)).not.toBeNull();
  });
});
