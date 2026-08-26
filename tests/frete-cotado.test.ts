import { describe, expect, it } from "vitest";
import { cotacaoDeFreteValida, temCotacaoDeFrete, type FreteCotado } from "@app/lib/format";

// ============================================================
// Pelo menos uma transportadora cotada (Intertech, 26/08/2026)
// ============================================================
//
// Sem cotação de frete o pedido não prossegue: é ela que sustenta a margem
// apresentada e o que a expedição usa para fechar com a transportadora.
//
// O que se protege aqui é a linha COMEÇADA e abandonada passar por cotação —
// alguém escolhe a transportadora, não digita o valor, e o sistema deixa
// seguir como se estivesse cotado.

function frete(campos: Partial<FreteCotado>): FreteCotado {
  return {
    id: "1", carrierId: null, carrierName: null, carrierOther: null,
    amount: null, leadTimeDays: null, quoteCode: null, selected: false,
    ...campos,
  };
}

describe("cotacaoDeFreteValida", () => {
  it("transportadora do cadastro com valor vale", () => {
    expect(cotacaoDeFreteValida(frete({ carrierId: "abc", amount: "384,00" }))).toBe(true);
  });

  it("transportadora digitada à mão também vale", () => {
    // "Outra" é opção legítima do formulário; recusá-la obrigaria a cadastrar
    // transportadora só para cotar.
    expect(cotacaoDeFreteValida(frete({ carrierOther: "JAMEF", amount: "175" }))).toBe(true);
  });

  it("transportadora sem valor não é cotação", () => {
    expect(cotacaoDeFreteValida(frete({ carrierId: "abc" }))).toBe(false);
    expect(cotacaoDeFreteValida(frete({ carrierId: "abc", amount: "" }))).toBe(false);
  });

  it("valor sem transportadora não é cotação", () => {
    expect(cotacaoDeFreteValida(frete({ amount: "384,00" }))).toBe(false);
  });

  it("frete zerado é campo esquecido, não cotação de graça", () => {
    expect(cotacaoDeFreteValida(frete({ carrierId: "abc", amount: "0" }))).toBe(false);
    expect(cotacaoDeFreteValida(frete({ carrierId: "abc", amount: "0,00" }))).toBe(false);
  });

  it("texto no lugar do valor não passa", () => {
    expect(cotacaoDeFreteValida(frete({ carrierId: "abc", amount: "a combinar" }))).toBe(false);
  });
});

describe("temCotacaoDeFrete", () => {
  it("basta uma válida entre várias começadas", () => {
    expect(temCotacaoDeFrete([
      frete({ carrierId: "a" }),
      frete({ carrierId: "b", amount: "300" }),
      frete({}),
    ])).toBe(true);
  });

  it("lista vazia, nula ou só com linhas pela metade não passa", () => {
    expect(temCotacaoDeFrete([])).toBe(false);
    expect(temCotacaoDeFrete(null)).toBe(false);
    expect(temCotacaoDeFrete(undefined)).toBe(false);
    expect(temCotacaoDeFrete([frete({ carrierId: "a" }), frete({ amount: "10" })])).toBe(false);
  });
});
