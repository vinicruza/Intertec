import { describe, expect, it } from "vitest";
import { percentual, reais } from "../app/lib/format";

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
