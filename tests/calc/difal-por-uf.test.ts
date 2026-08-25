import { describe, expect, it } from "vitest";
import { simular } from "../../app/lib/sim/params";

// ============================================================
// DIFAL por UF (21/08/2026, regra corrigida em 25/08/2026)
// ============================================================
//
// Quem desliga o DIFAL de um pedido é o PEDIDO: o canal não aplicar
// (Revendas, Descpro) ou a marcação manual do simulador — `applies_difal`.
// A UF entra na conta pela alíquota, e só: alíquota zero dá DIFAL zero, que é
// como SP funciona (venda interna).
//
// A chave por estado NÃO aparece aqui de propósito. Entre 21 e 25/08/2026 ela
// se chamava `charges_difal` e zerava a alíquota na montagem do contexto —
// treze estados desmarcados, e a margem dos pedidos deles saindo até 9 pontos
// acima da real. A Intertech corrigiu a leitura em 25/08: a chave é de
// DESTAQUE, não de cobrança. O imposto é deduzido da margem em toda UF que
// tenha alíquota, destacado ou não (Calculations.md §7.2.1).

const CANAL_COM_DIFAL = { aplicaDifal: true, comissaoPadrao: "0.025", modeloFrete: "manual" as const };
const CANAL_SEM_DIFAL = { aplicaDifal: false, comissaoPadrao: "0.025", modeloFrete: "manual" as const };
const ITENS = [{ nome: "Oclusor", precoVenda: "3.60", quantidade: "700", cmvUnitario: "1.3370955156829692", despesaUnitaria: "0" }];

function rodar(difalFinal: string, canal: typeof CANAL_COM_DIFAL, aplicaDifal?: boolean) {
  return simular({
    itens: ITENS,
    freteManual: "82",
    fretePorContaCliente: true,
    comissao: null,
    aplicaDifal,
    canal,
    uf: { aliquotaIcsm: "0.1625", difalFinal, fretePortalPct: null },
  }).resultado;
}

describe("DIFAL: a UF precisa cobrar E o pedido precisa aplicar", () => {
  it("UF cobra + canal aplica → DIFAL entra", () => {
    // 13,5% × (2.520 + 82)
    expect(rodar("0.135", CANAL_COM_DIFAL).difal.toString()).toBe("351.27");
  });

  it("alíquota 0 (SP, venda interna) → DIFAL zera mesmo com o canal aplicando", () => {
    expect(rodar("0", CANAL_COM_DIFAL).difal.toString()).toBe("0");
  });

  it("canal não aplica → DIFAL zera mesmo a UF tendo alíquota", () => {
    expect(rodar("0.135", CANAL_SEM_DIFAL).difal.toString()).toBe("0");
  });

  it("as duas desligadas continuam dando zero", () => {
    expect(rodar("0", CANAL_SEM_DIFAL).difal.toString()).toBe("0");
  });

  it("a marcação manual do pedido continua mandando sobre o canal", () => {
    // Override liga num canal que não aplica…
    expect(rodar("0.135", CANAL_SEM_DIFAL, true).difal.toString()).toBe("351.27");
    // …e desliga num canal que aplica.
    expect(rodar("0.135", CANAL_COM_DIFAL, false).difal.toString()).toBe("0");
  });

  it("desligar o DIFAL não mexe em mais nada da cascata", () => {
    const com = rodar("0.135", CANAL_COM_DIFAL);
    const sem = rodar("0", CANAL_COM_DIFAL);
    expect(sem.receitaBruta.toString()).toBe(com.receitaBruta.toString());
    expect(sem.imposto.toString()).toBe(com.imposto.toString());
    expect(sem.impostoFrete.toString()).toBe(com.impostoFrete.toString());
    expect(sem.comissao.toString()).toBe(com.comissao.toString());
    expect(sem.cmvTotal.toString()).toBe(com.cmvTotal.toString());
    // A receita líquida sobe exatamente o DIFAL que deixou de sair.
    expect(sem.receitaLiquida.minus(com.receitaLiquida).toString()).toBe("351.27");
  });

  // A base do DIFAL segue receita + frete informado (decisão de 18/08/2026).
  it("a base é receita + frete informado", () => {
    expect(rodar("0.135", CANAL_COM_DIFAL).baseDifal.toString()).toBe("2602");
  });
});

// ============================================================
// Regressão: o pedido de Patrocínio/MG (24/08/2026)
// ============================================================
//
// A vendedora reclamou que a cotação "não está puxando o valor do DIFAL", e
// que "MG cobra". Ela estava certa nas duas coisas: MG cobra 6% (seed 0008) e
// o valor não aparecia na folha — mas o motor SEMPRE calculou. O defeito era
// de exibição, não de cálculo (Calculations.md §12.4). Este teste fixa o
// número do pedido dela para o dia em que alguém achar que o cálculo é que
// estava errado.

describe("pedido de Patrocínio/MG (CEP 38700-196)", () => {
  const ITENS_DO_PRINT = [
    { nome: "CT0013 Campo Catarata 1,00x1,20", precoVenda: "9.80", quantidade: "100", cmvUnitario: "1", despesaUnitaria: "0" },
    { nome: "CA0006 Campo Com Adesivo 0,50x0,50", precoVenda: "7.20", quantidade: "50", cmvUnitario: "1", despesaUnitaria: "0" },
    { nome: "CM0003 Campo de Mesa 0,70x0,70", precoVenda: "5.90", quantidade: "50", cmvUnitario: "1", despesaUnitaria: "0" },
    { nome: "OC0002 Oclusor Não Estéril", precoVenda: "2.30", quantidade: "100", cmvUnitario: "1", despesaUnitaria: "0" },
  ];

  function pedidoDeMG(fretePorContaCliente: boolean) {
    return simular({
      itens: ITENS_DO_PRINT,
      freteManual: "145", // BRASPRESS, a transportadora marcada no print
      fretePorContaCliente,
      comissao: null,
      aplicaDifal: null, // sem override: vale o padrão do canal
      canal: CANAL_COM_DIFAL,
      uf: { aliquotaIcsm: "0.1625", difalFinal: "0.06", fretePortalPct: null }, // MG = 6%
    }).resultado;
  }

  it("6% sobre receita + frete = 120,60", () => {
    const r = pedidoDeMG(false);
    expect(r.receitaBruta.toString()).toBe("1865");
    expect(r.baseDifal.toString()).toBe("2010");
    expect(r.difal.toString()).toBe("120.6");
  });

  it("frete destacado não muda o DIFAL — a base usa o frete INFORMADO (§6.3)", () => {
    expect(pedidoDeMG(true).difal.toString()).toBe("120.6");
  });
});

// ============================================================
// Golden: o pedido da CLINICA DR LUIZ MADEIRA (aba Isabela, 25/08/2026)
// ============================================================
//
// É o pedido que expôs a regra errada. PA tem alíquota de 12% e estava com a
// chave desmarcada: o sistema mostrava margem de 60,48% e a planilha da
// Intertech, 51,49%. A cliente confirmou que a planilha é a base e que o PA
// "realmente não tem essa cobrança", mas que ela "precisa entrar no cálculo,
// mas não pode ser destacada".
//
// Este teste trava os dois números da planilha. Se alguém voltar a zerar a
// alíquota de uma UF não destacada, ele quebra aqui.
describe("golden: PA não destacado deduz DIFAL igual à planilha", () => {
  const pedido = simular({
    // CMV unitário ajustado para reproduzir o CMV do pedido da planilha
    // (R$ 311,12); o que este teste guarda é o DIFAL e a receita líquida.
    itens: [
      { nome: "Campo Catarata 0,80 x 0,80 GR30", precoVenda: "7.50", quantidade: "50", cmvUnitario: "2.1732", despesaUnitaria: "0" },
      { nome: "Avental", precoVenda: "12.80", quantidade: "50", cmvUnitario: "4.0492", despesaUnitaria: "0" },
    ],
    freteManual: "200",
    fretePorContaCliente: true,
    comissao: null,
    canal: { aplicaDifal: true, comissaoPadrao: "0.025", modeloFrete: "manual" },
    uf: { aliquotaIcsm: "0.1625", difalFinal: "0.12", fretePortalPct: null },
  }).resultado;

  it("o DIFAL sai como na planilha — 12% sobre receita + frete", () => {
    expect(pedido.baseDifal.toString()).toBe("1215");
    expect(pedido.difal.toString()).toBe("145.8");
  });

  it("a receita líquida e a margem batem com a planilha", () => {
    expect(pedido.receitaLiquida.toDecimalPlaces(2).toString()).toBe("641.39");
    expect(pedido.cmvTotal.toString()).toBe("311.12");
    // 51,49% — o número que a vendedora vê na planilha. Sem o DIFAL dariam
    // R$ 787,19 e 60,48%, que foi o que o sistema exibiu antes da correção.
    expect(pedido.margemContribuicaoPct.times(100).toDecimalPlaces(2).toString()).toBe("51.49");
  });
});
