import { describe, expect, it } from "vitest";
import { produtosAfetadosPorInsumo, type ProdutoCascata } from "@calc";

// ============================================================
// "O que muda se eu alterar o preço deste insumo?"
// ============================================================
//
// A pergunta que a planilha nunca soube responder — lá, mexer num insumo era
// um salto no escuro. A resposta tem de incluir a dependência INDIRETA: um kit
// que contém um produto que consome o insumo também muda de CMV.
//
// Esta função sustenta o aviso de impacto na tela de edição de insumo, então
// um falso negativo aqui é pior que um falso positivo: significa alterar um
// preço achando que nada muda.

const direto = (id: string, insumoId: string): ProdutoCascata => ({
  id,
  componentes: [{ tipo: "insumo", insumoId, quantidade: { tipo: "direta", quantidade: "1" } }],
});

const composto = (id: string, produtoId: string): ProdutoCascata => ({
  id,
  componentes: [{ tipo: "produto", produtoId, quantidade: { tipo: "direta", quantidade: "1" } }],
});

describe("dependência direta", () => {
  it("encontra o produto que consome o insumo", () => {
    const afetados = produtosAfetadosPorInsumo("bobina", [direto("avental", "bobina")]);
    expect([...afetados]).toEqual(["avental"]);
  });

  it("ignora produto que não usa o insumo", () => {
    const afetados = produtosAfetadosPorInsumo("bobina", [direto("outro", "punho")]);
    expect(afetados.size).toBe(0);
  });

  it("insumo sem nenhum consumidor devolve conjunto vazio", () => {
    expect(produtosAfetadosPorInsumo("caixa-5", [direto("avental", "bobina")]).size).toBe(0);
  });
});

describe("dependência indireta (cascata de kits)", () => {
  it("kit que contém produto afetado também é afetado", () => {
    const produtos = [direto("avental", "bobina"), composto("kit", "avental")];
    const afetados = produtosAfetadosPorInsumo("bobina", produtos);
    expect(afetados.has("avental")).toBe(true);
    expect(afetados.has("kit")).toBe(true);
  });

  it("propaga por três níveis (insumo → produto → kit → kit maior)", () => {
    const produtos = [
      direto("avental", "bobina"),
      composto("kit", "avental"),
      composto("kit-mestre", "kit"),
    ];
    const afetados = produtosAfetadosPorInsumo("bobina", produtos);
    expect([...afetados].sort()).toEqual(["avental", "kit", "kit-mestre"]);
  });

  it("não arrasta kit que só contém produtos não afetados", () => {
    const produtos = [
      direto("avental", "bobina"),
      direto("campo", "tnt"),
      composto("kit-campo", "campo"),
    ];
    const afetados = produtosAfetadosPorInsumo("bobina", produtos);
    expect(afetados.has("avental")).toBe(true);
    expect(afetados.has("kit-campo")).toBe(false);
  });

  it("kit com componente afetado E não afetado entra na lista", () => {
    const produtos: ProdutoCascata[] = [
      direto("avental", "bobina"),
      direto("campo", "tnt"),
      {
        id: "kit-misto",
        componentes: [
          { tipo: "produto", produtoId: "avental", quantidade: { tipo: "direta", quantidade: "1" } },
          { tipo: "produto", produtoId: "campo", quantidade: { tipo: "direta", quantidade: "2" } },
        ],
      },
    ];
    expect(produtosAfetadosPorInsumo("bobina", produtos).has("kit-misto")).toBe(true);
  });
});

describe("robustez", () => {
  it("produto com componentes mistos (insumo + produto) é detectado pelos dois caminhos", () => {
    const produtos: ProdutoCascata[] = [
      direto("avental", "bobina"),
      {
        id: "campo-especial",
        componentes: [
          { tipo: "insumo", insumoId: "punho", quantidade: { tipo: "direta", quantidade: "1" } },
          { tipo: "produto", produtoId: "avental", quantidade: { tipo: "direta", quantidade: "1" } },
        ],
      },
    ];
    expect(produtosAfetadosPorInsumo("bobina", produtos).has("campo-especial")).toBe(true);
    expect(produtosAfetadosPorInsumo("punho", produtos).has("campo-especial")).toBe(true);
  });

  it("referência a produto inexistente não quebra a varredura", () => {
    const produtos = [direto("avental", "bobina"), composto("kit", "produto-fantasma")];
    const afetados = produtosAfetadosPorInsumo("bobina", produtos);
    expect(afetados.has("avental")).toBe(true);
    expect(afetados.has("kit")).toBe(false);
  });

  it("o resultado não depende da ordem dos produtos na lista", () => {
    const emOrdem = [direto("avental", "bobina"), composto("kit", "avental")];
    const invertido = [composto("kit", "avental"), direto("avental", "bobina")];
    expect([...produtosAfetadosPorInsumo("bobina", emOrdem)].sort()).toEqual(
      [...produtosAfetadosPorInsumo("bobina", invertido)].sort()
    );
  });
});
