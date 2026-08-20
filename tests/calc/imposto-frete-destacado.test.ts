import { describe, expect, it } from "vitest";
import { dec } from "@calc";
import { simular } from "../../app/lib/sim/params";

// ============================================================
// A regra do frete destacado, ditada pelo Bryan em áudio (19/08/2026)
// ============================================================
//
// Nas palavras dele:
//
//   "Se o frete estiver destacado na nota, o imposto deve ser calculado sobre o
//    valor do pedido MAIS o frete. Se o frete não estiver destacado na nota, ou
//    seja, se ele não aparecer na nota fiscal, o imposto deve ser calculado
//    SOMENTE sobre o valor do pedido, que será o valor total da nota fiscal."
//
// O sistema não tem uma linha só de imposto: tem DUAS — "Imposto sobre a venda"
// e "Imposto sobre o frete". A regra do Bryan fala do total das duas somadas, e
// é assim que ela é cobrada aqui. Escrever o teste sobre a soma (e não sobre as
// linhas separadas) é de propósito: se um dia as duas linhas virarem uma só, ou
// a base de uma delas mudar, este teste continua valendo — ele guarda a REGRA,
// não o desenho da tela.
//
// O banco faz a mesma conta em `close_order_with_snapshots`:
//
//   v_tax        := v_tax_rate * v_gross;
//   v_freight_tax := case when freight_paid_by_customer   -- "frete destacado"
//                         then v_tax_rate * p_freight else 0 end;
//
// Se esta regra mudar, muda nos DOIS lados na mesma entrega — senão o
// fechamento recusa o pedido por "totais não reconciliam".

const CANAL = { aplicaDifal: true, comissaoPadrao: "0.025", modeloFrete: "manual" as const };

// Os três orçamentos reais conferidos contra a planilha em 19 e 20/08/2026.
const CASOS = [
  {
    nome: "OLHO CLINICA — SP, alíquota 27,25%, frete R$ 55,00",
    aliquota: "0.2725",
    difal: "0",
    frete: "55",
    itens: [
      { nome: "Campo Lasik", precoVenda: "12.00", quantidade: "20", cmvUnitario: "3.1764631727047868", despesaUnitaria: "0" },
      { nome: "Oclusor", precoVenda: "3.60", quantidade: "50", cmvUnitario: "1.3370955156829692", despesaUnitaria: "0" },
    ],
    receita: "420",
    comDestaque: "129.4375",
    semDestaque: "114.45",
  },
  {
    nome: "Oclusor — BA, alíquota 16,25%, frete R$ 82,00",
    aliquota: "0.1625",
    difal: "0.135",
    frete: "82",
    itens: [{ nome: "Oclusor", precoVenda: "3.60", quantidade: "700", cmvUnitario: "1.3370955156829692", despesaUnitaria: "0" }],
    receita: "2520",
    comDestaque: "422.825",
    semDestaque: "409.5",
  },
  {
    nome: "INOVE — PR, alíquota 21,25%, frete R$ 190,00",
    aliquota: "0.2125",
    difal: "0.075",
    frete: "190",
    itens: [{ nome: "Kit INOVE", precoVenda: "33.75", quantidade: "100", cmvUnitario: "10.66219873", despesaUnitaria: "0" }],
    receita: "3375",
    comDestaque: "757.5625",
    semDestaque: "717.1875",
  },
];

function impostoTotal(caso: (typeof CASOS)[number], destacado: boolean) {
  const s = simular({
    itens: caso.itens,
    freteManual: caso.frete,
    fretePorContaCliente: destacado, // é a caixa "Frete destacado" da tela
    comissao: null,
    canal: CANAL,
    uf: { aliquotaIcsm: caso.aliquota, difalFinal: caso.difal, fretePortalPct: null },
  });
  return s.resultado.imposto.plus(s.resultado.impostoFrete);
}

describe("frete destacado define a base do imposto (regra do Bryan, 19/08/2026)", () => {
  for (const caso of CASOS) {
    it(`${caso.nome}: DESTACADO → imposto sobre pedido + frete`, () => {
      const esperado = dec(caso.aliquota).times(dec(caso.receita).plus(caso.frete));
      expect(impostoTotal(caso, true).toString()).toBe(esperado.toString());
      expect(impostoTotal(caso, true).toString()).toBe(caso.comDestaque);
    });

    it(`${caso.nome}: NÃO destacado → imposto só sobre o pedido`, () => {
      const esperado = dec(caso.aliquota).times(caso.receita);
      expect(impostoTotal(caso, false).toString()).toBe(esperado.toString());
      expect(impostoTotal(caso, false).toString()).toBe(caso.semDestaque);
    });

    it(`${caso.nome}: a diferença entre os dois é exatamente alíquota × frete`, () => {
      const diferenca = impostoTotal(caso, true).minus(impostoTotal(caso, false));
      expect(diferenca.toString()).toBe(dec(caso.aliquota).times(caso.frete).toString());
    });
  }

  // Frete zero é o caso em que a regra não tem o que decidir — os dois estados
  // da caixa precisam dar o mesmo imposto. Sem isto, um erro de sinal na base
  // passaria despercebido nos casos acima, onde o frete é sempre > 0.
  it("sem frete, marcar ou não a caixa não muda o imposto", () => {
    const caso = { ...CASOS[1], frete: "0" };
    expect(impostoTotal(caso, true).toString()).toBe(impostoTotal(caso, false).toString());
    expect(impostoTotal(caso, true).toString()).toBe(dec(caso.aliquota).times(caso.receita).toString());
  });
});
