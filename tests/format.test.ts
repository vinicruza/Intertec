import { describe, expect, it, vi } from "vitest";
import { fracaoParaPercentual, haQuanto, numeroDigitado, percentual, problemaNaCidade, problemaNoCampoNumerico, reais } from "../app/lib/format";

describe("formatação defensiva de valores do Supabase", () => {
  it.each([
    [10, "R$ 10,00"],
    [10.5, "R$ 10,50"],
    ["10.5", "R$ 10,50"],
    [null, "—"],
    [undefined, "—"],
    ["valor inválido", "—"],
  ])("formata moeda %j", (entrada, esperado) => {
    expect(reais(entrada)).toBe(esperado);
  });

  it.each([
    [0.18, "18,00%"],
    ["0.0925", "9,25%"],
    [null, "—"],
    ["inválido", "—"],
  ])("formata percentual %j", (entrada, esperado) => {
    expect(percentual(entrada)).toBe(esperado);
  });
});

describe("normalização numérica defensiva", () => {
  it("aceita número vindo do banco onde a tela espera string", () => {
    expect(numeroDigitado(12.5)).toBe("12.5");
    expect(fracaoParaPercentual(0.025)).toBe("2,5");
  });
});

describe("tempo decorrido (fila de aprovação)", () => {
  const agora = new Date("2026-07-30T12:00:00Z");

  it("nulo devolve travessão", () => {
    expect(haQuanto(null)).toBe("—");
    expect(haQuanto(undefined)).toBe("—");
  });

  it.each([
    ["2026-07-30T11:59:00Z", "agora há pouco"],
    ["2026-07-30T10:00:00Z", "há 2 horas"],
    ["2026-07-30T11:00:00Z", "há 1 hora"],
    ["2026-07-29T12:00:00Z", "há 1 dia"],
    ["2026-07-25T12:00:00Z", "há 5 dias"],
  ])("%s → %s", (iso, esperado) => {
    vi.useFakeTimers();
    vi.setSystemTime(agora);
    try {
      expect(haQuanto(iso)).toBe(esperado);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ============================================================
// Campo numérico de formulário — relatado em 25/08/2026
// ============================================================
//
// O campo Volumes aceitava qualquer digitação e só reclamava depois da viagem
// ao banco, em inglês. A vendedora queria registrar como as caixas foram
// montadas — informação legítima, campo errado.
describe("problemaNoCampoNumerico", () => {
  const volumes = (v: string) => problemaNoCampoNumerico(v, { inteiro: true, rotulo: "Volumes" });
  const peso = (v: string) => problemaNoCampoNumerico(v, { inteiro: false, rotulo: "O peso" });

  it("pega o caso relatado e aponta o campo certo", () => {
    const p = volumes("2 cx6+1cx3 = 3");
    expect(p).toContain("aceita só o número de volumes");
    expect(p).toContain("Composição dos volumes");
  });

  it("aceita o que é válido", () => {
    expect(volumes("3")).toBeNull();
    expect(peso("12,5")).toBeNull();
    expect(peso("33")).toBeNull();
  });

  it("campo em branco é válido: peso e volumes são opcionais", () => {
    expect(volumes("")).toBeNull();
    expect(volumes("   ")).toBeNull();
    expect(peso(null as unknown as string)).toBeNull();
  });

  it("volume quebrado não passa; peso quebrado passa", () => {
    expect(volumes("2,5")).toContain("número inteiro");
    expect(peso("2,5")).toBeNull();
  });

  it("zero e negativo caem na mesma regra da trava do banco", () => {
    expect(volumes("0")).toContain("maior que zero");
    expect(peso("-1")).toContain("maior que zero");
  });
});

// Relatado em 25/08/2026: o CEP foi digitado no campo Cidade, e a ficha
// imprimiria "Cidade/UF entrega: 15775039".
describe("problemaNaCidade", () => {
  it("acusa o CEP digitado no campo da cidade", () => {
    expect(problemaNaCidade("15775039")).toContain("parece um CEP");
    expect(problemaNaCidade("29055-260")).toContain("parece um CEP");
  });

  it("aceita cidade de verdade, inclusive com número no nome", () => {
    expect(problemaNaCidade("Vitória")).toBeNull();
    expect(problemaNaCidade("São Paulo")).toBeNull();
    expect(problemaNaCidade("Embu-Guaçu")).toBeNull();
  });

  it("em branco é válido: a cidade é opcional", () => {
    expect(problemaNaCidade("")).toBeNull();
    expect(problemaNaCidade(null)).toBeNull();
  });
});
