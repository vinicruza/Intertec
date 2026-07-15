import { describe, expect, it } from "vitest";
import { limitesMesSaoPaulo } from "../app/lib/periodo";

describe("limites mensais em America/Sao_Paulo", () => {
  it("converte a meia-noite brasileira para UTC", () => {
    expect(limitesMesSaoPaulo("2026-07")).toEqual({
      inicio: "2026-07-01T03:00:00.000Z",
      fim: "2026-08-01T03:00:00.000Z",
    });
  });

  it("atravessa dezembro para janeiro", () => {
    expect(limitesMesSaoPaulo("2026-12").fim).toBe("2027-01-01T03:00:00.000Z");
  });

  it.each(["", "2026-13", "07-2026"])("rejeita período inválido %j", (mes) => {
    expect(() => limitesMesSaoPaulo(mes)).toThrow(/Mês inválido/);
  });
});
