import { describe, expect, it } from "vitest";
import { resolverKitDoPedido, type CatalogoParaKit } from "@app/lib/sim/kitNoPedido";
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
        { insumoId: "envelope", quantidade: "1" },
        { insumoId: "caixa", quantidade: "2" },
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
    const embalagem = [{ insumoId: "caixa", quantidade: "1" }];
    const assinatura = assinaturaKitCompleta(produtos, embalagem);

    const r = resolverKitDoPedido(
      produtos,
      embalagem,
      catalogo(new Map([[assinatura, { id: "kit-1", codigo: "KC-0007", nome: "Kit catarata" }]]))
    );

    expect(r.kitExistente).toEqual({ id: "kit-1", codigo: "KC-0007", nome: "Kit catarata" });
  });

  it("não confunde kits que só diferem no número de caixas", () => {
    const produtos = [{ produtoId: "avental", quantidade: "2" }];
    const uma = resolverKitDoPedido(produtos, [{ insumoId: "caixa", quantidade: "1" }], catalogo());
    const duas = resolverKitDoPedido(produtos, [{ insumoId: "caixa", quantidade: "2" }], catalogo());

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
      [{ insumoId: "", quantidade: "1" }],
      catalogo()
    );
    expect(r.erro).toBeNull();
    expect(r.assinatura).toBe("avental:2");
    expect(r.custoEmbalagem).toBe("0");
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

  it("insumo de embalagem sem preço não derruba o cálculo, só não soma", () => {
    const r = resolverKitDoPedido(
      [{ produtoId: "avental", quantidade: "1" }],
      [{ insumoId: "semPreco", quantidade: "1" }],
      catalogo()
    );
    expect(r.erro).toBeNull();
    expect(r.custoEmbalagem).toBe("0");
    // Mas ele CONTA para a identidade do kit — a composição é outra.
    expect(r.assinatura).toContain("semPreco");
  });
});
