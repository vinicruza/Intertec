import { describe, expect, it, vi } from "vitest";
import { fracaoParaPercentual, haQuanto, numeroDigitado, percentual, reais } from "../app/lib/format";

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
