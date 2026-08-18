import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { Decimal } from "../../lib/calculations/decimal";
import { planilhaDeWorkbook } from "../../lib/import/exceljs-loader";
import {
  aliquotaDifal,
  aliquotaIcsm,
  extrairPedido,
  extrairTabelasFiscais,
  normalizarRotulo,
  percentualPortal,
} from "../../lib/import/pedidos";
import {
  conferirPedido,
  conferirTabelasFiscais,
  type CanalPedido,
} from "../../lib/import/conferencia";
import type { Planilha } from "../../lib/import/types";

// ============================================================
// Leitura das abas de vendedor (Camada 4) e conferência contra o motor.
//
// Tudo aqui roda com planilhas SINTÉTICAS: o arquivo real do cliente não vai
// para o Git, e o teste não pode depender dele. Os números são os mesmos
// padrões que as abas reais usam (Calculations.md §6, §8).
// ============================================================

// Planilha de mentira, montada a partir de um mapa "A1" → valor.
function planilhaFalsa(abas: Record<string, Record<string, string | number>>): Planilha {
  const letraParaColuna = (letra: string) =>
    letra.split("").reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);
  const indexado: Record<string, Record<string, string | number>> = {};
  for (const [aba, celulas] of Object.entries(abas)) {
    indexado[aba] = {};
    for (const [ref, valor] of Object.entries(celulas)) {
      const m = /^([A-Z]+)(\d+)$/.exec(ref);
      if (!m) throw new Error(`Referência inválida: ${ref}`);
      indexado[aba][`${m[2]}:${letraParaColuna(m[1])}`] = valor;
    }
  }
  return {
    abas: () => Object.keys(indexado),
    dimensoes: () => ({ linhas: 80, colunas: 26 }),
    valor: (aba, linha, coluna) => indexado[aba]?.[`${linha}:${coluna}`] ?? null,
  };
}

// Uma aba de vendedor no formato padrão (Patricia/Camila/…): itens a partir da
// linha 7, bloco de deduções na M/N, total do pedido na linha 24.
function abaPadrao(extra: Record<string, string | number> = {}) {
  return {
    C2: "Cliente:",
    D2: "Hospital Teste",
    J2: "Isa",
    C4: "UF",
    D4: "BA",
    C7: "Avental TNT Sem Manga Não Estéril",
    D7: 4.2,
    E7: 4000,
    F7: 16800,
    H7: 1.537605,
    J7: 0.778783,
    M6: "Frete do Pedido",
    N6: 1000,
    M7: "Imposto Frete",
    N7: 162.5,
    M8: "Imposto",
    N8: 2730,
    M9: "Difal",
    N9: 2268,
    M10: "Comissão",
    N10: 445, // 2,5% × (16.800 + 1.000 de frete) — regra confirmada em 18/08/2026
    M11: "Frete Cliente",
    N11: 0,
    F23: "Total do Pedido",
    F24: 16800,
    J24: 6150.42,
    K24: 3115.132,
    M14: "Receita Liquida",
    N14: 10194.5,
    M16: "Margem de Contribuição",
    N16: 0.3966923341,
    ...extra,
  };
}

const CANAL_PADRAO: CanalPedido = {
  aplicaDifal: true,
  aliquotaComissao: new Decimal("0.025"),
  freteViaPortal: false,
};

const TABELAS = extrairTabelasFiscais(
  planilhaFalsa({
    ICSM: {
      A1: "Estado",
      A2: "BA",
      B2: 0.0925,
      C2: 0.07,
      D2: 0.1625,
      A3: "SP",
      B3: 0.0925,
      C3: 0.18,
      D3: 0.2725,
      A4: "PR",
      B4: 0.0925,
      C4: 0.12,
      D4: 0.2125,
    },
    DIFAL: {
      A1: "Estado",
      A2: "BA",
      B2: 0,
      C2: 0.135,
      D2: 0.135,
      A3: "PR",
      B3: 0,
      C3: 0.075,
      D3: 0.075,
    },
    Portal: { A1: "UF", A2: "BA", B2: 0.17, A3: "SP", B3: 0.036 },
  })
);

describe("normalização de rótulo", () => {
  it("ignora acento, caixa e espaço repetido", () => {
    expect(normalizarRotulo("Comissão")).toBe("comissao");
    expect(normalizarRotulo("  Receita   Liquida ")).toBe("receita liquida");
    expect(normalizarRotulo("Margem de Contribuição")).toBe("margem de contribuicao");
    expect(normalizarRotulo(null)).toBe("");
  });
});

describe("extração da aba de vendedor", () => {
  it("lê cabeçalho, itens e deduções pelo rótulo", () => {
    const p = planilhaFalsa({ Patricia: abaPadrao() });
    const pedido = extrairPedido(p, "Patricia")!;

    expect(pedido.cliente).toBe("Hospital Teste");
    expect(pedido.uf).toBe("BA");
    expect(pedido.vendedor).toBe("Isa");
    expect(pedido.linhaTotal).toBe(24);
    expect(pedido.itens).toHaveLength(1);
    expect(pedido.receitaPlanilha?.toString()).toBe("16800");
    expect(pedido.deducoes.frete?.toString()).toBe("1000");
    expect(pedido.deducoes.difal?.toString()).toBe("2268");
    expect(pedido.deducoes.freteCliente).toBe(false);
  });

  it("acha a linha de total onde ela estiver — as abas reais variam da 24 à 41", () => {
    const deslocada = { ...abaPadrao() };
    delete (deslocada as Record<string, unknown>).F23;
    delete (deslocada as Record<string, unknown>).F24;
    const p = planilhaFalsa({
      Isabela: { ...deslocada, F40: "Total do Pedido", F41: 16800, J41: 6150.42 },
    });
    const pedido = extrairPedido(p, "Isabela")!;
    expect(pedido.linhaTotal).toBe(41);
    expect(pedido.receitaPlanilha?.toString()).toBe("16800");
  });

  it("lê o bloco de deduções por rótulo, não por linha — aba sem DIFAL sobe as de baixo", () => {
    // Revendas/Descpro/Edmilson não têm a linha "Difal": tudo abaixo sobe uma
    // linha. Ler por posição fixa trocaria comissão por DIFAL sem avisar.
    const semDifal = { ...abaPadrao() };
    for (const ref of ["M9", "N9", "M10", "N10", "M11", "N11"]) {
      delete (semDifal as Record<string, unknown>)[ref];
    }
    const p = planilhaFalsa({
      Revendas: { ...semDifal, M9: "Comissão", N9: 420, M10: "Frete Cliente", N10: "x" },
    });
    const pedido = extrairPedido(p, "Revendas")!;

    expect(pedido.deducoes.difal).toBeNull();
    expect(pedido.deducoes.comissao?.toString()).toBe("420");
    expect(pedido.deducoes.freteCliente).toBe(true);
  });

  it('"Imposto Frete" não é engolido pelo prefixo "Imposto"', () => {
    const p = planilhaFalsa({ Patricia: abaPadrao() });
    const d = extrairPedido(p, "Patricia")!.deducoes;
    expect(d.impostoFrete?.toString()).toBe("162.5");
    expect(d.imposto?.toString()).toBe("2730");
  });

  it("a flag de frete do cliente casa X maiúsculo e minúsculo, e só isso", () => {
    const marcada = (v: string | number) =>
      extrairPedido(planilhaFalsa({ Patricia: abaPadrao({ N11: v }) }), "Patricia")!.deducoes
        .freteCliente;
    expect(marcada("X")).toBe(true);
    expect(marcada("x")).toBe(true);
    expect(marcada(0)).toBe(false);
    expect(marcada("")).toBe(false);
  });
});

describe("tabelas de parâmetro", () => {
  it("a UF é case-insensitive — a planilha escreve ora PR, ora rj", () => {
    expect(aliquotaIcsm(TABELAS, "ba")?.toString()).toBe("0.1625");
    expect(aliquotaIcsm(TABELAS, " Sp ")?.toString()).toBe("0.2725");
    expect(aliquotaIcsm(TABELAS, "ZZ")).toBeNull();
  });

  it("SP não tem linha de DIFAL: venda interna devolve zero, por decisão explícita", () => {
    expect(aliquotaDifal(TABELAS, "SP").toString()).toBe("0");
    expect(aliquotaDifal(TABELAS, "BA").toString()).toBe("0.135");
  });

  it("lê o percentual de frete do canal marketplace", () => {
    expect(percentualPortal(TABELAS, "sp")?.toString()).toBe("0.036");
  });

  it("acusa DIFAL final diferente de Pobreza + Alíquota (§9.5) e UF ausente", () => {
    const tabelas = extrairTabelasFiscais(
      planilhaFalsa({
        ICSM: { A1: "Estado", A2: "BA", B2: 0.0925, C2: 0.07, D2: 0.1625 },
        DIFAL: { A1: "Estado", A2: "AL", B2: 0.01, C2: 0.12, D2: 0.145 },
        Portal: { A1: "UF", A2: "BA", B2: 0.17 },
      })
    );
    const achados = conferirTabelasFiscais(tabelas);
    const al = achados.find((a) => a.tabela === "DIFAL" && a.uf === "AL")!;
    expect(al.esperado?.toString()).toBe("0.13");
    expect(al.encontrado?.toString()).toBe("0.145");
    expect(achados.some((a) => a.tabela === "ICSM" && a.uf === "SP")).toBe(true);
  });
});

describe("conferência do motor contra a aba", () => {
  it("reproduz a planilha quando as regras coincidem (fixture T6 — BA, frete 1.000)", () => {
    const p = planilhaFalsa({ Patricia: abaPadrao() });
    const c = conferirPedido(extrairPedido(p, "Patricia")!, TABELAS, CANAL_PADRAO);

    expect(c.bloqueio).toBeNull();
    expect(c.divergencias).toHaveLength(0);
    expect(c.resultado!.receitaLiquida.toFixed(2)).toBe("10194.50");
  });

  it("acusa a aba que ficou com a comissão só sobre a receita (fórmula antiga)", () => {
    // Desde 18/08/2026 o sistema comissiona receita + frete (golden test T16).
    // Quatro abas da planilha ficaram para trás com `=2,5%*$F$24` — e é ESSA
    // que agora aparece como divergência, invertendo o sinal do achado.
    const p = planilhaFalsa({
      Revendas: abaPadrao({ N10: 420, N14: 10219.5, N16: 0.3982 }),
    });
    const c = conferirPedido(extrairPedido(p, "Revendas")!, TABELAS, CANAL_PADRAO);

    const comissao = c.divergencias.find((d) => d.campo === "Comissão")!;
    expect(comissao.sistema!.toFixed(2)).toBe("445.00");
    expect(comissao.planilha!.toFixed(2)).toBe("420.00");
    expect(comissao.diferenca!.toFixed(2)).toBe("25.00");
  });

  it("recusa o pedido que a planilha aceitou com CMV zerado (T9)", () => {
    const p = planilhaFalsa({ Nathalia: abaPadrao({ C8: "Compressa P", E8: 70, H8: 0 }) });
    const c = conferirPedido(extrairPedido(p, "Nathalia")!, TABELAS, CANAL_PADRAO);

    expect(c.resultado).toBeNull();
    expect(c.bloqueio).toContain("CMV zerado");
    expect(c.bloqueio).toContain("Compressa P");
  });

  it("sinaliza como estrutural a linha que a aba não tem, em vez de tratar como empate", () => {
    const semImposto = { ...abaPadrao() };
    delete (semImposto as Record<string, unknown>).N8;
    const p = planilhaFalsa({ Revendas: semImposto });
    const c = conferirPedido(extrairPedido(p, "Revendas")!, TABELAS, CANAL_PADRAO);

    const imposto = c.divergencias.find((d) => d.campo === "Imposto sobre venda")!;
    expect(imposto.planilha).toBeNull();
    expect(imposto.diferenca).toBeNull();
    expect(imposto.bate).toBe(false);
  });

  it("bloqueia UF fora da tabela em vez de calcular com imposto zero", () => {
    const p = planilhaFalsa({ Patricia: abaPadrao({ D4: "ZZ" }) });
    const c = conferirPedido(extrairPedido(p, "Patricia")!, TABELAS, CANAL_PADRAO);
    expect(c.bloqueio).toContain("não encontrada na tabela ICSM");
  });

  it("no canal marketplace, calcula o frete pelo percentual do Portal", () => {
    const p = planilhaFalsa({
      Mari: abaPadrao({ D4: "SP", N6: 604.8, N7: 164.808, N8: 4578, N9: 0 }),
    });
    const c = conferirPedido(extrairPedido(p, "Mari")!, TABELAS, {
      ...CANAL_PADRAO,
      freteViaPortal: true,
    });
    // 3,6% × 16.800 = 604,80
    expect(c.resultado!.freteInformado.toFixed(2)).toBe("604.80");
    expect(c.divergencias.some((d) => d.campo === "Frete informado")).toBe(false);
  });
});

describe("leitura de célula do exceljs", () => {
  // Regressão: o getter `value` do exceljs monta o objeto com `if (value)`, e o
  // resultado em cache ZERO — sendo falsy — sumia. Uma dedução de R$ 0,00 vinha
  // como "linha ausente", que é uma informação completamente diferente.
  it("preserva o resultado ZERO de uma célula de fórmula", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Edmilson");
    ws.getCell("N7").value = { formula: "A1*B1", result: 0 };
    ws.getCell("N8").value = { formula: "A1*B1", result: 31.5 };

    const planilha = planilhaDeWorkbook(wb);
    expect(planilha.valor("Edmilson", 7, 14)).toBe(0);
    expect(planilha.valor("Edmilson", 8, 14)).toBe(31.5);
  });

  it("fórmula sem valor em cache continua sendo nula — nunca inventa zero", () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Edmilson");
    ws.getCell("N7").value = { formula: "A1*B1" } as ExcelJS.CellFormulaValue;

    expect(planilhaDeWorkbook(wb).valor("Edmilson", 7, 14)).toBeNull();
  });
});
