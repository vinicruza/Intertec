import { describe, expect, it } from "vitest";
import { simular } from "../../app/lib/sim/params";

// ============================================================
// DIFAL por UF selecionável (pedido da Intertech, 21/08/2026)
// ============================================================
//
// Até aqui "não cobra DIFAL" só existia de duas formas: o CANAL não aplicar
// (Revendas, Descpro), ou a UF não ter linha em `difal_rates` — que é como SP
// funciona. A segunda obriga a APAGAR a linha, e com ela a alíquota pesquisada.
//
// A coluna `difal_rates.charges_difal` separa as duas coisas. Na montagem do
// contexto (`carregarContextoSimulador`), UF que não cobra entra com alíquota
// "0"; daí para baixo o motor não muda. Estes testes travam o E lógico:
// a UF precisa COBRAR e o pedido precisa APLICAR.

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

  it("UF NÃO cobra (alíquota 0) → DIFAL zera mesmo com o canal aplicando", () => {
    expect(rodar("0", CANAL_COM_DIFAL).difal.toString()).toBe("0");
  });

  it("canal não aplica → DIFAL zera mesmo a UF cobrando", () => {
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

  // A base do DIFAL segue receita + frete informado (decisão de 18/08/2026),
  // e desligar por UF não pode mudar isso para quem continua cobrando.
  it("quem cobra continua com a base receita + frete", () => {
    expect(rodar("0.135", CANAL_COM_DIFAL).baseDifal.toString()).toBe("2602");
  });
});
