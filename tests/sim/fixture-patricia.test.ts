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

  it("reproduz a cascata do pedido: RL 10.219,50 e margem 39,82% (status Atenção)", () => {
    const s = simular(entrada);
    expect(toMoney(s.resultado.receitaBruta)).toBe("16800.00");
    expect(toMoney(s.resultado.imposto)).toBe("2730.00");
    expect(toMoney(s.resultado.difal)).toBe("2268.00");
    expect(toMoney(s.resultado.comissao)).toBe("420.00");
    expect(toMoney(s.resultado.impostoFrete)).toBe("162.50");
    expect(toMoney(s.resultado.receitaLiquida)).toBe("10219.50");
    expect(toPercent(s.resultado.margemContribuicaoPct)).toBe("39.82");
    expect(toPercent(s.resultado.resultadoAposRateioPct)).toBe("9.33");
    expect(s.avisos).toHaveLength(0);

    // 39,82% cai na faixa "Atenção" (25–40%)
    expect(statusMargem(s.resultado.margemContribuicaoPct, REGRAS)?.label).toBe("Atenção");
  });

  it("canal Revendas (sem DIFAL): margem sobe e o DIFAL zera", () => {
    const s = simular({ ...entrada, canal: { ...entrada.canal, aplicaDifal: false } });
    expect(toMoney(s.difalAplicado)).toBe("0.00");
    expect(toMoney(s.resultado.receitaLiquida)).toBe("12487.50"); // 10.219,50 + 2.268
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
    expect(toMoney(s.resultado.comissao)).toBe("1024.80"); // 6,1% × 16.800
  });
});
