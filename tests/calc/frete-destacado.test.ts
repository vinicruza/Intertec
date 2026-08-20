import { describe, expect, it } from "vitest";
import { dec, toPercent } from "@calc";
import { simular } from "../../app/lib/sim/params";

// ============================================================
// A caixa "Frete destacado" — o sistema segue a PLANILHA (decisão de 21/08/2026)
// ============================================================
//
// A caixa da tela é a coluna "Frete Cliente" da planilha, e manda em duas
// coisas de uma vez:
//
//   MARCADA   (destacado na nota, o cliente paga o transporte)
//       frete NÃO sai do resultado   — na planilha, `N12 = -N6` anula a linha
//       imposto sobre o frete        — SIM
//
//   EM BRANCO (a Intertec paga o transporte)
//       frete SAI do resultado       — na planilha, `N12 = 0`, e o
//                                      `N14 = F24 - SOMA(N6:N12)` desconta tudo
//       imposto sobre o frete        — SIM (a linha `N7 = alíquota × N6` da
//                                      planilha não olha o "X")
//
// É o mesmo modelo do Calculations.md §6 e do golden test T6, que trava um
// frete de R$ 1.000 pago pela Intertec deduzindo 1.000 E cobrando 162,50.
//
// ------------------------------------------------------------
// PENDÊNCIA REGISTRADA: o áudio do Bryan (19/08/2026) pede outra coisa
// ------------------------------------------------------------
//
//   "Se o frete não estiver destacado na nota, ou seja, se ele não aparecer na
//    nota fiscal, o imposto deve ser calculado SOMENTE sobre o valor do pedido."
//
// Pela regra dele, a linha "Imposto sobre o frete" deveria ser ZERO quando a
// caixa está em branco — e o próprio Bryan disse, no mesmo áudio, que "na
// planilha eu não consegui configurar qual é a forma correta". A planilha, o
// Calculations.md §6 e o T6 dizem o contrário, e a decisão de 21/08/2026 foi
// seguir a planilha até a empresa fechar a regra.
//
// Enquanto isso, a diferença é exatamente `alíquota × frete` em pedido com a
// caixa EM BRANCO. Os testes marcados "REGRA DO BRYAN" abaixo descrevem o que
// mudaria; quando a decisão vier, é neles que se mexe.
//
// O banco faz a mesma conta em `close_order_with_snapshots`. Se esta regra
// mudar, muda nos DOIS lados na mesma entrega — senão o fechamento recusa o
// pedido por "totais não reconciliam".

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
  },
  {
    nome: "Oclusor — BA, alíquota 16,25%, frete R$ 82,00",
    aliquota: "0.1625",
    difal: "0.135",
    frete: "82",
    itens: [{ nome: "Oclusor", precoVenda: "3.60", quantidade: "700", cmvUnitario: "1.3370955156829692", despesaUnitaria: "0" }],
    receita: "2520",
  },
  {
    nome: "INOVE — PR, alíquota 21,25%, frete R$ 190,00",
    aliquota: "0.2125",
    difal: "0.075",
    frete: "190",
    itens: [{ nome: "Kit INOVE", precoVenda: "33.75", quantidade: "100", cmvUnitario: "10.66219873", despesaUnitaria: "0" }],
    receita: "3375",
  },
];

function rodar(caso: (typeof CASOS)[number], destacado: boolean) {
  return simular({
    itens: caso.itens,
    freteManual: caso.frete,
    fretePorContaCliente: destacado, // é a caixa "Frete destacado" da tela
    comissao: null,
    canal: CANAL,
    uf: { aliquotaIcsm: caso.aliquota, difalFinal: caso.difal, fretePortalPct: null },
  }).resultado;
}

describe("caixa Frete destacado — o frete sai ou não do resultado", () => {
  for (const caso of CASOS) {
    it(`${caso.nome}: MARCADA → o frete não reduz o resultado`, () => {
      const r = rodar(caso, true);
      expect(r.frete.toString()).toBe("0");
      expect(r.freteInformado.toString()).toBe(caso.frete); // fica registrado para auditoria
    });

    it(`${caso.nome}: EM BRANCO → o frete inteiro sai do resultado`, () => {
      const r = rodar(caso, false);
      expect(r.frete.toString()).toBe(caso.frete);
    });

    it(`${caso.nome}: a diferença de receita líquida entre os dois é o frete cheio`, () => {
      const diferenca = rodar(caso, true).receitaLiquida.minus(rodar(caso, false).receitaLiquida);
      expect(diferenca.toString()).toBe(caso.frete);
    });

    // A planilha cobra o imposto sobre o frete nos dois estados da caixa.
    // REGRA DO BRYAN: aqui é onde ela mudaria — com a caixa em branco, o
    // esperado passaria a ser "0".
    it(`${caso.nome}: imposto sobre o frete é cobrado nos dois casos (planilha)`, () => {
      const esperado = dec(caso.aliquota).times(caso.frete).toString();
      expect(rodar(caso, true).impostoFrete.toString()).toBe(esperado);
      expect(rodar(caso, false).impostoFrete.toString()).toBe(esperado);
    });

    // DIFAL e comissão seguem `receita + frete informado` nos dois estados
    // (decisões de 18/08/2026). Sem isto, um erro no par de flags passaria
    // despercebido: são as duas linhas que NÃO mudam com a caixa.
    it(`${caso.nome}: DIFAL e comissão não mudam com a caixa`, () => {
      const marcada = rodar(caso, true);
      const branco = rodar(caso, false);
      const base = dec(caso.receita).plus(caso.frete);
      expect(marcada.difal.toString()).toBe(branco.difal.toString());
      expect(marcada.comissao.toString()).toBe(branco.comissao.toString());
      expect(marcada.baseDifal.toString()).toBe(base.toString());
      expect(marcada.baseComissao.toString()).toBe(base.toString());
    });
  }

  // Sem frete a caixa não tem o que decidir. Trava um erro de sinal que os
  // casos acima não pegariam, porque neles o frete é sempre > 0.
  it("sem frete, marcar ou não a caixa dá exatamente o mesmo resultado", () => {
    const caso = { ...CASOS[1], frete: "0" };
    expect(rodar(caso, true).receitaLiquida.toString()).toBe(rodar(caso, false).receitaLiquida.toString());
    expect(rodar(caso, true).impostoFrete.toString()).toBe("0");
  });
});

// O orçamento da aba `Patricia` de 20/08/2026, reproduzido inteiro: é o caso em
// que o cliente pegou a divergência, e o que fecha a conferência da §3.10/§3.12.
describe("ORC-2026-0041 reproduz a aba Patricia com o frete em branco", () => {
  const caso = CASOS[1];

  it("receita líquida 1.598,855 e margem 41,4601786% — os números da planilha", () => {
    const r = rodar(caso, false);
    expect(r.frete.toString()).toBe("82");
    expect(r.impostoFrete.toString()).toBe("13.325");
    expect(r.imposto.toString()).toBe("409.5");
    expect(r.difal.toString()).toBe("351.27");
    expect(r.comissao.toString()).toBe("65.05");
    expect(r.receitaLiquida.toString()).toBe("1598.855");
    // A planilha mostra 0,4146017863 na célula N16.
    expect(toPercent(r.margemContribuicaoPct)).toBe("41.46");
    expect(r.margemContribuicaoPct.toFixed(10)).toBe("0.4146017863");
  });
});
