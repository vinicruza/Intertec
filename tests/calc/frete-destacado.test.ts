import { describe, expect, it } from "vitest";
import { dec, toMoney, toPercent } from "@calc";
import { freteDestacadoPadrao, simular } from "../../app/lib/sim/params";

// ============================================================
// A caixa "Frete destacado" — regra do Bryan (áudio de 19/08/2026)
// ============================================================
//
// Nas palavras dele:
//
//   "Se o frete estiver destacado na nota, o imposto deve ser calculado sobre o
//    valor do pedido MAIS o frete. Se o frete não estiver destacado na nota, ou
//    seja, se ele não aparecer na nota fiscal, o imposto deve ser calculado
//    SOMENTE sobre o valor do pedido, que será o valor total da nota fiscal."
//
// É o posicionamento da empresa, e vale sobre a planilha. A caixa da tela manda
// nas DUAS pontas da cascata:
//
//   MARCADA   (destacado na nota, o cliente paga o transporte)
//       frete NÃO sai do resultado  — na planilha, `N12 = -N6` anula a linha
//       imposto sobre o frete       — SIM (ele está na nota)
//
//   EM BRANCO (a Intertec paga o transporte)
//       frete SAI do resultado      — na planilha, `N12 = 0`, e o
//                                     `N14 = F24 - SOMA(N6:N12)` desconta tudo
//       imposto sobre o frete       — NÃO (ele não está na nota)
//
// ------------------------------------------------------------
// Onde a planilha ainda diverge — e é a planilha que está atrasada
// ------------------------------------------------------------
//
// A linha `N7 = alíquota × N6` da planilha cobra o imposto sobre o frete nos
// dois estados da caixa, e o próprio Bryan disse no mesmo áudio: "na planilha
// eu não consegui configurar qual é a forma correta". A correção lá é
// `N7 = SE(N11="X"; alíquota × N6; 0)`.
//
// Enquanto isso, em pedido NÃO destacado a planilha cobra `alíquota × frete` a
// mais que o sistema. Nos orçamentos conferidos: SP 14,99 · BA 13,33 · PR 40,38.
//
// O golden test T6 continua descrevendo a cascata da PLANILHA (deduz E tributa)
// e o T14c descreve a da EMPRESA (deduz e não tributa) — os dois no mesmo
// pedido-fixture, e a diferença entre eles é exatamente os 162,50.
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

describe("caixa Frete destacado — manda no resultado E no imposto", () => {
  for (const caso of CASOS) {
    it(`${caso.nome}: MARCADA → não reduz o resultado, mas é tributado`, () => {
      const r = rodar(caso, true);
      expect(r.frete.toString()).toBe("0");
      expect(r.freteInformado.toString()).toBe(caso.frete); // fica registrado para auditoria
      expect(r.impostoFrete.toString()).toBe(dec(caso.aliquota).times(caso.frete).toString());
    });

    it(`${caso.nome}: EM BRANCO → sai inteiro do resultado e NÃO é tributado`, () => {
      const r = rodar(caso, false);
      expect(r.frete.toString()).toBe(caso.frete);
      expect(r.impostoFrete.toString()).toBe("0");
    });

    // A regra do Bryan escrita como ele a enunciou: sobre o TOTAL das duas
    // linhas de imposto, que é o que a nota fiscal enxerga.
    it(`${caso.nome}: o imposto total é a regra do Bryan, nos dois estados`, () => {
      const comDestaque = rodar(caso, true);
      const semDestaque = rodar(caso, false);
      expect(comDestaque.imposto.plus(comDestaque.impostoFrete).toString()).toBe(
        dec(caso.aliquota).times(dec(caso.receita).plus(caso.frete)).toString()
      );
      expect(semDestaque.imposto.plus(semDestaque.impostoFrete).toString()).toBe(
        dec(caso.aliquota).times(caso.receita).toString()
      );
    });

    // Marcar a caixa devolve o frete ao resultado, mas cobra o imposto dele.
    it(`${caso.nome}: marcar a caixa vale frete × (1 − alíquota)`, () => {
      const diferenca = rodar(caso, true).receitaLiquida.minus(rodar(caso, false).receitaLiquida);
      expect(diferenca.toString()).toBe(dec(caso.frete).times(dec("1").minus(caso.aliquota)).toString());
    });

    // DIFAL e comissão seguem `receita + frete informado` nos dois estados
    // (decisões de 18/08/2026). São as duas linhas que NÃO mudam com a caixa —
    // sem isto, um erro no par de flags passaria despercebido.
    it(`${caso.nome}: DIFAL e comissão não mudam com a caixa`, () => {
      const marcada = rodar(caso, true);
      const branco = rodar(caso, false);
      const base = dec(caso.receita).plus(caso.frete);
      expect(marcada.difal.toString()).toBe(branco.difal.toString());
      expect(marcada.comissao.toString()).toBe(branco.comissao.toString());
      expect(marcada.baseDifal.toString()).toBe(base.toString());
      expect(marcada.baseComissao.toString()).toBe(base.toString());
    });

    // O tamanho exato da divergência que sobra contra a planilha, para quando
    // o Bryan ajustar a célula N7 e a conferência voltar a fechar em tudo.
    it(`${caso.nome}: a planilha cobra alíquota × frete a mais quando não destacado`, () => {
      const naPlanilha = dec(caso.aliquota).times(caso.frete);
      const noSistema = rodar(caso, false).impostoFrete;
      expect(noSistema.toString()).toBe("0");
      expect(naPlanilha.minus(noSistema).toString()).toBe(naPlanilha.toString());
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

// O ORC-2026-0041 (aba `Patricia`, 20/08/2026) é o pedido em que o cliente
// pegou a divergência. Aqui ele fica inteiro, com a diferença para a planilha
// isolada numa linha só.
describe("ORC-2026-0041 — Oclusor 700 un a R$ 3,60, BA, frete R$ 82,00 em branco", () => {
  const caso = CASOS[1];

  it("bate com a planilha em tudo, menos no imposto sobre o frete", () => {
    const r = rodar(caso, false);
    expect(toMoney(r.receitaBruta)).toBe("2520.00"); // planilha F24
    expect(toMoney(r.frete)).toBe("82.00"); // planilha N6, descontado por N12 = 0
    expect(toMoney(r.imposto)).toBe("409.50"); // planilha N8
    expect(toMoney(r.difal)).toBe("351.27"); // planilha N9
    expect(toMoney(r.comissao)).toBe("65.05"); // planilha N10
    // Planilha N7 = 13,325. Aqui é zero, pela regra do Bryan: o frete não está
    // na nota. É a única linha em que os dois discordam.
    expect(toMoney(r.impostoFrete)).toBe("0.00");
    expect(toMoney(r.receitaLiquida)).toBe("1612.18"); // planilha N14 = 1.598,855
    expect(toPercent(r.margemContribuicaoPct)).toBe("41.94"); // planilha N16 = 41,46%
  });

  it("a diferença para a planilha é exatamente 16,25% × 82,00", () => {
    const r = rodar(caso, false);
    const receitaLiquidaDaPlanilha = dec("1598.855");
    expect(r.receitaLiquida.minus(receitaLiquidaDaPlanilha).toString()).toBe(
      dec("0.1625").times("82").toString()
    );
  });
});

// ============================================================
// A caixa já nasce marcada (pedido da Intertech, 31/08/2026)
// ============================================================
//
// Nas palavras da cliente: "não dá para a gente fazer ao contrário, deixando
// ele sempre destacado? Quando não for, elas teriam que desmarcar." Destacar é
// a regra na venda direta; não destacar é a exceção.
//
// A exceção da exceção é o canal de frete automático (Marketplace), que a
// própria cliente tirou da conversa ("esquece o marketplace"): lá o frete não
// é digitado, é uma ESTIMATIVA de % da receita por UF que a Intertech paga.
// Marcá-lo por padrão jogaria esse valor estimado na conta do cliente — que é
// exatamente o erro relatado no pedido 05270826 e corrigido em 27/08/2026.
describe("padrão da caixa Frete destacado", () => {
  it("canal de frete digitado nasce com o frete destacado", () => {
    expect(freteDestacadoPadrao("manual")).toBe(true);
  });

  it("canal de frete automático (Marketplace) nasce sem destaque", () => {
    expect(freteDestacadoPadrao("uf_percent")).toBe(false);
  });

  it("sem canal escolhido ainda, vale a regra da venda direta", () => {
    expect(freteDestacadoPadrao(null)).toBe(true);
    expect(freteDestacadoPadrao(undefined)).toBe(true);
  });
});
