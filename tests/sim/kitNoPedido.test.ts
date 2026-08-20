import { describe, expect, it } from "vitest";
import {
  resolverKitDoPedido,
  type CatalogoParaKit,
  linhasDaEmbalagem,
  escolhaDasLinhas,
  EMBALAGEM_VAZIA,
  type PapelNoKit,
} from "@app/lib/sim/kitNoPedido";
import { assinaturaKitCompleta, type CustoProdutoKit } from "@calc";

// Kit montado dentro do pedido (reunião Intertech 16/07/2026).

const custoPorProduto = new Map<string, CustoProdutoKit>([
  ["avental", { cmv: "4.043151" }],
  ["campo", { cmv: "2.935400" }],
  ["semCusto", { cmv: "0" }],
]);

const insumoPorId = new Map([
  ["envelope", { nome: "Envelope 25x30", precoSemImposto: "0.51802", maoDeObra: false }],
  ["caixa", { nome: "Caixa esterilização", precoSemImposto: "0.066542", maoDeObra: false }],
  ["semPreco", { nome: "Insumo sem preço", precoSemImposto: null, maoDeObra: false }],
]);

function catalogo(kits: CatalogoParaKit["kitPorAssinatura"] = new Map()): CatalogoParaKit {
  return { custoPorProduto, insumoPorId, kitPorAssinatura: kits };
}

describe("kit montado dentro do pedido", () => {
  it("calcula o CMV somando produtos e embalagem por kit", () => {
    const r = resolverKitDoPedido(
      [
        { produtoId: "avental", quantidade: "2" },
        { produtoId: "campo", quantidade: "3" },
      ],
      [
        { insumoId: "envelope", modo: "porKit", quantidade: "1" },
        { insumoId: "caixa", modo: "porKit", quantidade: "2" },
      ],
      catalogo()
    );

    expect(r.erro).toBeNull();
    expect(r.custoProdutos).toBe("16.892502");
    expect(r.custoEmbalagem).toBe("0.651104");
    expect(r.cmvUnitario).toBe("17.543606");
  });

  it("aceita vírgula como separador decimal, do jeito que a tela envia", () => {
    const comVirgula = resolverKitDoPedido(
      [{ produtoId: "avental", quantidade: "1,5" }],
      [],
      catalogo()
    );
    const comPonto = resolverKitDoPedido(
      [{ produtoId: "avental", quantidade: "1.5" }],
      [],
      catalogo()
    );
    expect(comVirgula.cmvUnitario).toBe(comPonto.cmvUnitario);
    expect(comVirgula.assinatura).toBe(comPonto.assinatura);
  });

  it("avisa quando a composição já existe no catálogo, em vez de duplicar", () => {
    const produtos = [{ produtoId: "avental", quantidade: "2" }];
    const embalagem = [{ insumoId: "caixa", modo: "porKit" as const, quantidade: "1" }];
    const assinatura = assinaturaKitCompleta(produtos, [
      { insumoId: "caixa", quantidade: { tipo: "direta", quantidade: "1" } },
    ]);

    const r = resolverKitDoPedido(
      produtos,
      embalagem,
      catalogo(new Map([[assinatura, { id: "kit-1", codigo: "KC-0007", nome: "Kit catarata" }]]))
    );

    expect(r.kitExistente).toEqual({ id: "kit-1", codigo: "KC-0007", nome: "Kit catarata" });
  });

  it("não confunde kits que só diferem no número de caixas", () => {
    const produtos = [{ produtoId: "avental", quantidade: "2" }];
    const uma = resolverKitDoPedido(produtos, [{ insumoId: "caixa", modo: "porKit", quantidade: "1" }], catalogo());
    const duas = resolverKitDoPedido(produtos, [{ insumoId: "caixa", modo: "porKit", quantidade: "2" }], catalogo());

    expect(uma.assinatura).not.toBe(duas.assinatura);
    // E o custo realmente difere por uma caixa.
    expect(Number(duas.cmvUnitario) - Number(uma.cmvUnitario)).toBeCloseTo(0.066542, 6);
  });

  it("ignora linhas em branco vindas da tela", () => {
    const r = resolverKitDoPedido(
      [
        { produtoId: "avental", quantidade: "2" },
        { produtoId: "", quantidade: "1" },
        { produtoId: "campo", quantidade: "" },
      ],
      [{ insumoId: "", modo: "porKit", quantidade: "1" }],
      catalogo()
    );
    expect(r.erro).toBeNull();
    expect(r.assinatura).toBe("avental:2");
    expect(r.custoEmbalagem).toBe("0");
  });

  it("a caixa de esterilização é rateada pelos itens que cabem nela", () => {
    // Retorno da Intertech (29/07/2026): no kit, a quantidade por caixa varia.
    // Lançar a caixa como "1 por kit" cobraria a caixa inteira de cada um.
    const produtos = [{ produtoId: "avental", quantidade: "1" }];
    const porKit = resolverKitDoPedido(
      produtos, [{ insumoId: "caixa", modo: "porKit", quantidade: "1" }], catalogo()
    );
    const rateada = resolverKitDoPedido(
      produtos, [{ insumoId: "caixa", modo: "itensPorCaixa", quantidade: "10" }], catalogo()
    );

    expect(Number(porKit.custoEmbalagem)).toBeCloseTo(0.066542, 6);
    expect(Number(rateada.custoEmbalagem)).toBeCloseTo(0.0066542, 7);
    // E são kits diferentes, porque o custo é diferente.
    expect(porKit.assinatura).not.toBe(rateada.assinatura);
    expect(rateada.assinatura).toContain("caixa:/10");
  });

  it("kit sem nenhum produto é erro, não custo zero", () => {
    const r = resolverKitDoPedido([], [], catalogo());
    expect(r.erro).toBe("Inclua ao menos um produto no kit.");
    expect(r.cmvUnitario).toBeNull();
  });

  it("produto sem custo vigente devolve CMV nulo, nunca zero silencioso", () => {
    const r = resolverKitDoPedido([{ produtoId: "desconhecido", quantidade: "1" }], [], catalogo());
    expect(r.cmvUnitario).toBeNull();
    // A assinatura continua válida, para o aviso de duplicidade ainda funcionar.
    expect(r.assinatura).toBe("desconhecido:1");
  });

  it("expõe a participação de custo por produto e por embalagem (30/07/2026)", () => {
    // Pedido do cliente: saber qual produto pesa mais no custo do kit, já
    // que não existe preço por produto (o cliente negocia o kit inteiro).
    const r = resolverKitDoPedido(
      [
        { produtoId: "avental", quantidade: "2" },
        { produtoId: "campo", quantidade: "3" },
      ],
      [{ insumoId: "envelope", modo: "porKit", quantidade: "1" }],
      catalogo()
    );

    expect(r.linhasProdutos).toHaveLength(2);
    expect(r.linhasProdutos[0].produtoId).toBe("avental");
    expect(r.linhasEmbalagem).toHaveLength(1);
    expect(r.linhasEmbalagem[0].insumoId).toBe("envelope");

    const soma = [...r.linhasProdutos, ...r.linhasEmbalagem].reduce(
      (s, l) => s + Number(l.participacao),
      0
    );
    expect(soma).toBeCloseTo(1, 6);
  });

  // Este teste travava o comportamento CONTRÁRIO até 19/08/2026: linha de
  // embalagem sem custo era descartada e o kit seguia com "custoEmbalagem: 0".
  // Ou seja, o orçamento saía barato demais e nada na tela dizia isso. Vale
  // mais travar a cotação do que emitir uma errada — a regra da casa é nunca
  // zero silencioso, e ela não valia aqui.
  it("insumo de embalagem sem custo derruba o cálculo em vez de somar zero", () => {
    const r = resolverKitDoPedido(
      [{ produtoId: "avental", quantidade: "1" }],
      [{ insumoId: "semPreco", modo: "porKit", quantidade: "1" }],
      catalogo()
    );
    expect(r.cmvUnitario).toBeNull();
    expect(r.custoEmbalagem).toBeNull();
    // Mas ele CONTA para a identidade do kit — a composição é outra.
    expect(r.assinatura).toContain("semPreco");
  });

  // A tela nunca recebe o preço do insumo: o custo de cada linha de embalagem
  // vem calculado do banco (o Comercial não lê `inputs`, por decisão de acesso).
  describe("custo da embalagem vindo do servidor", () => {
    const comCustos = (m: Map<string, string | null>) => ({ ...catalogo(), custoEmbalagemPorChave: m });

    it("usa o custo resolvido do servidor em vez de preço × quantidade", () => {
      const r = resolverKitDoPedido(
        [{ produtoId: "avental", quantidade: "1" }],
        [{ insumoId: "semPreco", modo: "porKit", quantidade: "2" }],
        comCustos(new Map([["semPreco|porKit|2", "3.50"]]))
      );
      expect(r.custoEmbalagem).toBe("3.5");
    });

    it("enquanto o servidor não respondeu, o kit fica SEM CMV — nunca com um número provisório", () => {
      const r = resolverKitDoPedido(
        [{ produtoId: "avental", quantidade: "1" }],
        [{ insumoId: "envelope", modo: "porKit", quantidade: "1" }],
        comCustos(new Map())
      );
      expect(r.cmvUnitario).toBeNull();
    });

    it("custo nulo do servidor (insumo sem preço) bloqueia o kit", () => {
      const r = resolverKitDoPedido(
        [{ produtoId: "avental", quantidade: "1" }],
        [{ insumoId: "envelope", modo: "porKit", quantidade: "1" }],
        comCustos(new Map([["envelope|porKit|1", null]]))
      );
      expect(r.cmvUnitario).toBeNull();
    });
  });
});

// O modelo que o cliente descreveu em 19/08/2026: a vendedora informa qual
// envelope e quantos envelopes cabem na caixa. Caixa e esterilização dividem o
// MESMO número, porque a esterilizadora cobra por caixa e é a mesma caixa que
// vai ao cliente.
describe("embalagem escolhida pela vendedora", () => {
  const AUTO = { etiquetinha: "etiq", grafica: "graf" };
  const escolha = {
    envelopeId: "env30x40",
    caixaId: "caixa6",
    esterilizacaoId: "horizont",
    envelopesPorCaixa: "30",
  };

  it("gera envelope 1 por kit, caixa e esterilização rateadas pelo mesmo número", () => {
    const l = linhasDaEmbalagem(escolha, AUTO);
    expect(l).toEqual([
      { insumoId: "env30x40", modo: "porKit", quantidade: "1" },
      { insumoId: "caixa6", modo: "itensPorCaixa", quantidade: "30" },
      { insumoId: "horizont", modo: "itensPorCaixa", quantidade: "30" },
      { insumoId: "etiq", modo: "porKit", quantidade: "1" },
      { insumoId: "graf", modo: "porKit", quantidade: "1" },
    ]);
  });

  it("caixa e esterilização usam sempre o mesmo número — não há como divergir", () => {
    const l = linhasDaEmbalagem({ ...escolha, envelopesPorCaixa: "50" }, AUTO);
    const rateadas = l.filter((x) => x.modo === "itensPorCaixa");
    expect(rateadas).toHaveLength(2);
    expect(new Set(rateadas.map((x) => x.quantidade)).size).toBe(1);
  });

  // Este teste mudou em 20/08/2026. Antes ele exigia que a caixa e a
  // esterilização NÃO virassem linha sem o número — e era isso que travava o
  // formulário da vendedora: a escolha dela é lida de volta das linhas, então a
  // caixa voltava sozinha para "Selecione…" e o número se apagava ao ser
  // digitado. A garantia que importa nunca foi "não virar linha", e sim "não
  // entrar no custo sem rateio". É essa que o teste passa a cobrar.
  it("caixa escolhida sem o número vira linha (para a tela lembrar), com quantidade vazia", () => {
    const l = linhasDaEmbalagem({ ...escolha, envelopesPorCaixa: "" }, AUTO);
    const rateadas = l.filter((x) => x.modo === "itensPorCaixa");
    expect(rateadas.map((x) => x.insumoId)).toEqual(["caixa6", "horizont"]);
    expect(rateadas.every((x) => x.quantidade === "")).toBe(true);
  });

  it("a escolha volta inteira das linhas mesmo pela metade — o formulário não se apaga", () => {
    const papeis = new Map<string, PapelNoKit | null>([
      ["env30x40", "envelope"],
      ["caixa6", "caixa"],
      ["horizont", "esterilizacao"],
      ["etiq", "automatico"],
      ["graf", "automatico"],
    ]);
    // Caixa escolhida, número ainda em branco: era exatamente aqui que a tela
    // devolvia caixaId vazio e a vendedora não conseguia sair do lugar.
    const meio = { ...escolha, esterilizacaoId: "", envelopesPorCaixa: "" };
    expect(escolhaDasLinhas(linhasDaEmbalagem(meio, AUTO), papeis)).toEqual(meio);
    // E com o número preenchido depois, continua batendo.
    const cheio = { ...escolha, envelopesPorCaixa: "30" };
    expect(escolhaDasLinhas(linhasDaEmbalagem(cheio, AUTO), papeis)).toEqual(cheio);
  });

  it("linha de caixa sem o número NÃO entra no custo — nada de caixa inteira por kit", () => {
    // A garantia original, agora cobrada onde ela de fato vale: no cálculo.
    const r = resolverKitDoPedido(
      [{ produtoId: "avental", quantidade: "1" }],
      linhasDaEmbalagem({ envelopeId: "envelope", caixaId: "caixa", esterilizacaoId: "", envelopesPorCaixa: "" }, {}),
      { ...catalogo(), custoEmbalagemPorChave: new Map([["envelope|porKit|1", "0.51802"]]) }
    );
    expect(r.linhasEmbalagem.map((x) => x.insumoId)).toEqual(["envelope"]);
    expect(r.cmvUnitario).toBe("4.561171"); // 4,043151 do avental + 0,51802 do envelope, sem centavo de caixa
  });

  it("etiquetinha entra sempre; gráfica só acompanha o envelope", () => {
    const semEnvelope = linhasDaEmbalagem({ ...escolha, envelopeId: "" }, AUTO);
    expect(semEnvelope.some((x) => x.insumoId === "etiq")).toBe(true);
    expect(semEnvelope.some((x) => x.insumoId === "graf")).toBe(false);
  });

  it("kit sem embalagem nenhuma continua possível", () => {
    expect(linhasDaEmbalagem(EMBALAGEM_VAZIA, {})).toEqual([]);
  });
});
