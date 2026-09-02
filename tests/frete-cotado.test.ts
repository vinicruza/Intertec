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

// ============================================================
// Retirada pelo cliente (Intertech, 02/09/2026)
// ============================================================
//
// "No caso de retirada elas vão selecionar a opção Retirada, mas não existe
// valor de frete, porque é o próprio cliente que retira." Sem esta exceção o
// pedido de retirada ficava preso na tela: a regra pedia um valor que não
// existe.
//
// A dispensa é da opção ESCOLHIDA, e só dela. Uma linha de retirada solta num
// pedido que vai viajar de transportadora liberaria o pedido sem cotação
// nenhuma — exatamente o que a regra de 26/08/2026 fecha.
const RETIRADA = new Set(["retirada-id"]);

describe("retirada dispensa o valor do frete", () => {
  it("retirada escolhida vale como cotação, mesmo sem valor", () => {
    expect(
      cotacaoDeFreteValida(frete({ carrierId: "retirada-id", selected: true }), RETIRADA)
    ).toBe(true);
    expect(
      cotacaoDeFreteValida(frete({ carrierId: "retirada-id", amount: "0", selected: true }), RETIRADA)
    ).toBe(true);
  });

  it("retirada NÃO escolhida não libera o pedido", () => {
    expect(
      cotacaoDeFreteValida(frete({ carrierId: "retirada-id", amount: "0" }), RETIRADA)
    ).toBe(false);
    expect(
      temCotacaoDeFrete(
        [frete({ carrierId: "retirada-id", amount: "0" }), frete({ carrierId: "jamef" })],
        RETIRADA
      )
    ).toBe(false);
  });

  it("transportadora comum escolhida continua precisando de valor", () => {
    expect(cotacaoDeFreteValida(frete({ carrierId: "jamef", selected: true }), RETIRADA)).toBe(false);
    expect(
      cotacaoDeFreteValida(frete({ carrierId: "jamef", amount: "0", selected: true }), RETIRADA)
    ).toBe(false);
  });

  it("sem a lista de retiradas nada muda para quem já usava a tela", () => {
    // A lista é opcional na assinatura: telas que não a carregam continuam
    // aplicando a regra de 26/08/2026 na íntegra.
    expect(cotacaoDeFreteValida(frete({ carrierId: "retirada-id", selected: true }))).toBe(false);
  });

  it("pedido com retirada escolhida passa na checagem da tela", () => {
    expect(
      temCotacaoDeFrete([frete({ carrierId: "retirada-id", amount: "0", selected: true })], RETIRADA)
    ).toBe(true);
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
