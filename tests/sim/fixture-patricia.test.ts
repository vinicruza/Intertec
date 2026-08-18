import { describe, expect, it } from "vitest";
import { toMoney, toPercent } from "@calc";
import { simular, statusMargem, type RegraMargem } from "../../app/lib/sim/params";

// Critério de aceite da Sprint 10: o pedido real da aba Patricia reproduzido
// pela MESMA montagem que a tela do simulador usa (canal → DIFAL/comissão/frete;
// UF → alíquotas). Valores do Calculations.md §6.

const REGRAS: RegraMargem[] = [
  { label: "Boa", min_rate: "0.40", max_rate: null, color: "green", sort_order: 1 },
  { label: "Atenção", min_rate: "0.25", max_rate: "0.40", color: "yellow", sort_order: 2 },
  { label: "Crítica", min_rate: "0.10", max_rate: "0.25", color: "orange", sort_order: 3 },
  { label: "Negativa", min_rate: null, max_rate: "0.10", color: "red", sort_order: 4 },
];

describe("simulador — fixture Patricia (Unimed Salto Itu, BA)", () => {
  const entrada = {
    itens: [
      {
        nome: "Avental TNT Sem Manga Não Estéril",
        precoVenda: "4.20",
        quantidade: "4000",
        cmvUnitario: "1.537605",
        despesaUnitaria: "0.778783",
      },
    ],
    freteManual: "1000",
    fretePorContaCliente: false,
    comissao: null, // usa o padrão do canal
    canal: { aplicaDifal: true, comissaoPadrao: "0.025", modeloFrete: "manual" as const },
    uf: { aliquotaIcsm: "0.1625", difalFinal: "0.135", fretePortalPct: "0.17" },
  };

  // ⚠️ Valores revisados em 18/08/2026, em duas decisões do cliente no mesmo
  // dia: a base da COMISSÃO (T16) e a do DIFAL (T17) passaram a incluir o
  // frete. Histórico: comissão 420,00 / DIFAL 2.268,00 / RL 11.382,00 / margem
  // 45,96%  →  comissão 445,00 / DIFAL 2.403,00 / RL 11.222,00 / margem 45,19%.
  it("reproduz a cascata com frete desmarcado: RL 11.222,00 e margem 45,19% (status Boa)", () => {
    const s = simular(entrada);
    expect(toMoney(s.resultado.receitaBruta)).toBe("16800.00");
    expect(toMoney(s.resultado.imposto)).toBe("2730.00");
    expect(toMoney(s.resultado.baseDifal)).toBe("17800.00"); // 16.800 + frete 1.000
    expect(toMoney(s.resultado.difal)).toBe("2403.00");
    expect(toMoney(s.resultado.baseComissao)).toBe("17800.00");
    expect(toMoney(s.resultado.comissao)).toBe("445.00");
    expect(toMoney(s.resultado.impostoFrete)).toBe("0.00");
    expect(toMoney(s.resultado.receitaLiquida)).toBe("11222.00");
    expect(toPercent(s.resultado.margemContribuicaoPct)).toBe("45.19");
    expect(toPercent(s.resultado.resultadoAposRateioPct)).toBe("17.43");
    expect(s.avisos).toHaveLength(0);

    // Com o frete desmarcado, a margem segue a leitura da rentabilidade antiga.
    expect(statusMargem(s.resultado.margemContribuicaoPct, REGRAS)?.label).toBe("Boa");
  });

  it("frete destacado ligado mantém a base da venda e deduz frete/imposto frete em linhas próprias", () => {
    const s = simular({ ...entrada, fretePorContaCliente: true });
    expect(toMoney(s.resultado.receitaBruta)).toBe("16800.00");
    expect(toMoney(s.resultado.comissao)).toBe("445.00");
    expect(toMoney(s.resultado.impostoFrete)).toBe("162.50");
    expect(toMoney(s.resultado.frete)).toBe("0.00");
    expect(toMoney(s.resultado.receitaLiquida)).toBe("11059.50");
  });

  it("canal Revendas (sem DIFAL): margem sobe e o DIFAL zera", () => {
    const s = simular({ ...entrada, canal: { ...entrada.canal, aplicaDifal: false } });
    expect(toMoney(s.difalAplicado)).toBe("0.00");
    expect(toMoney(s.resultado.receitaLiquida)).toBe("13625.00"); // 11.222,00 + 2.403
  });

  it("canal Marketplace: frete vira % da receita por UF (BA 17%)", () => {
    const s = simular({ ...entrada, canal: { ...entrada.canal, modeloFrete: "uf_percent" } });
    expect(toMoney(s.freteUsado)).toBe("2856.00"); // 17% × 16.800
  });

  it("DIFAL aplicável e zerado gera aviso (não bloqueia)", () => {
    const s = simular({ ...entrada, uf: { ...entrada.uf, difalFinal: "0" } });
    expect(s.avisos.some((a) => /DIFAL/.test(a))).toBe(true);
  });

  it("override de comissão é respeitado (Externos 6,1%)", () => {
    const s = simular({ ...entrada, comissao: "0.061" });
    expect(toMoney(s.resultado.comissao)).toBe("1085.80"); // 6,1% × 17.800 (receita + frete)
  });

  // Override de DIFAL por pedido (05/08/2026): o canal decide o padrão, mas
  // dentro do MESMO canal um pedido pode ser para contribuinte e outro não —
  // então o vendedor precisa poder ligar/desligar caso a caso (áudio da
  // Intertech, 05/08/2026). Confirmado: DIFAL é devido pela Intertech quando
  // o cliente é NÃO CONTRIBUINTE; contribuinte não gera DIFAL. A fórmula em
  // si (alíquota × receita) não muda — só quem decide se ela roda.
  it("override desliga o DIFAL mesmo com o canal aplicando por padrão", () => {
    const s = simular({ ...entrada, aplicaDifal: false });
    expect(s.aplicaDifalUsado).toBe(false);
    expect(toMoney(s.difalAplicado)).toBe("0.00"); // alíquota usada, zerada
    expect(toMoney(s.resultado.difal)).toBe("0.00"); // valor em R$
    expect(toMoney(s.resultado.receitaLiquida)).toBe("13625.00"); // igual ao canal Revendas
  });

  it("override liga o DIFAL mesmo com o canal não aplicando por padrão", () => {
    const s = simular({
      ...entrada,
      canal: { ...entrada.canal, aplicaDifal: false },
      aplicaDifal: true,
    });
    expect(s.aplicaDifalUsado).toBe(true);
    expect(s.difalAplicado.toString()).toBe("0.135"); // alíquota usada
    expect(toMoney(s.resultado.difal)).toBe("2403.00"); // valor em R$
    expect(toMoney(s.resultado.receitaLiquida)).toBe("11222.00"); // igual ao padrão
  });

  it("sem override (null/undefined), usa o padrão do canal — comportamento antigo preservado", () => {
    const semOverride = simular(entrada);
    const comOverrideNulo = simular({ ...entrada, aplicaDifal: null });
    expect(semOverride.aplicaDifalUsado).toBe(true);
    expect(comOverrideNulo.aplicaDifalUsado).toBe(true);
    expect(toMoney(comOverrideNulo.difalAplicado)).toBe(toMoney(semOverride.difalAplicado));
  });
});
