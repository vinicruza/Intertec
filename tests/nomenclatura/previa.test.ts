import { describe, expect, it } from "vitest";
import type { FamiliaNF } from "../../lib/nomenclatura/descricaoNF";
import { FAMILIAS_INICIAIS } from "../../lib/nomenclatura/familiasIniciais";
import { previaDaNomenclatura, type ProdutoParaPrevia } from "../../lib/nomenclatura/previa";

const CATALOGO: ProdutoParaPrevia[] = [
  { id: "1", nome: "Campo de Mesa 0,70 x 0,70", descricaoAtual: "Campo Cirúrgico com Reforço 0,70 x 0,70", origem: "regra" },
  { id: "2", nome: "Campo de Mesa 1,00 x 1,20", descricaoAtual: "Campo Cirúrgico com Reforço 1,00 x 1,20", origem: "regra" },
  { id: "3", nome: "Campo Simples 1,00 x 1,20 GR40", descricaoAtual: "Campo Cirúrgico Sem Fenestra 1,00 x 1,20", origem: "regra" },
  { id: "4", nome: "Bota", descricaoAtual: "Bota", origem: "regra" },
  // Ajustado à mão: a regra diria outra coisa, e mesmo assim não pode encostar.
  { id: "5", nome: "Campo de Mesa 2,00 x 2,00", descricaoAtual: "Campo de Mesa Reforçado 2x2", origem: "manual" },
];

function comOutroNome(nomeNF: string): FamiliaNF[] {
  return FAMILIAS_INICIAIS.map((f) => (f.comeco === "Campo de Mesa" ? { ...f, nomeNF } : f));
}

describe("prévia da nomenclatura de NF", () => {
  it("sem mexer em nada, nada muda", () => {
    const p = previaDaNomenclatura(CATALOGO, FAMILIAS_INICIAIS);
    expect(p.mudam).toEqual([]);
    expect(p.inalterados).toBe(4);
    expect(p.protegidos).toBe(1);
    expect(p.total).toBe(5);
  });

  it("trocar o nome de uma família mostra exatamente quem seria afetado", () => {
    const p = previaDaNomenclatura(CATALOGO, comOutroNome("Campo Cirúrgico de Mesa"));
    expect(p.mudam.map((m) => m.id)).toEqual(["1", "2"]);
    expect(p.mudam[0]).toEqual({
      id: "1",
      nome: "Campo de Mesa 0,70 x 0,70",
      de: "Campo Cirúrgico com Reforço 0,70 x 0,70",
      para: "Campo Cirúrgico de Mesa 0,70 x 0,70",
    });
    // O Campo Simples e a Bota não são da família mexida.
    expect(p.inalterados).toBe(2);
  });

  it("produto ajustado à mão nunca entra na lista de mudanças", () => {
    const p = previaDaNomenclatura(CATALOGO, comOutroNome("Campo Cirúrgico de Mesa"));
    expect(p.mudam.some((m) => m.id === "5")).toBe(false);
    expect(p.protegidos).toBe(1);
  });

  it("desativar uma família devolve os produtos dela ao nome do catálogo", () => {
    const semMesa = FAMILIAS_INICIAIS.filter((f) => f.comeco !== "Campo de Mesa");
    const p = previaDaNomenclatura(CATALOGO, semMesa);
    // Sem a família específica, "Campo de Mesa" cai na genérica "Campo".
    expect(p.mudam.map((m) => m.para)).toEqual([
      "Campo Cirúrgico de Mesa 0,70 x 0,70",
      "Campo Cirúrgico de Mesa 1,00 x 1,20",
    ]);
  });

  it("sem nenhuma família, todo produto sai com o nome do catálogo", () => {
    const p = previaDaNomenclatura(CATALOGO, []);
    expect(p.mudam.map((m) => m.para)).toEqual([
      "Campo de Mesa 0,70 x 0,70",
      "Campo de Mesa 1,00 x 1,20",
      "Campo Simples 1,00 x 1,20 GR40",
    ]);
    expect(p.inalterados).toBe(1); // a Bota já era igual ao nome do catálogo
  });

  it("catálogo vazio não quebra", () => {
    expect(previaDaNomenclatura([], FAMILIAS_INICIAIS)).toEqual({
      mudam: [],
      inalterados: 0,
      protegidos: 0,
      total: 0,
    });
  });
});
