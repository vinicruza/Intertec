import { describe, expect, it } from "vitest";

// Teste de infraestrutura: garante que a esteira de testes (Vitest) funciona.
// Os golden tests do Calculations.md §11 entram na Sprint 3, junto com o motor
// de cálculo em lib/calculations/ — e, uma vez criados, nunca podem ser removidos.
describe("infraestrutura de testes", () => {
  it("executa testes", () => {
    expect(1 + 1).toBe(2);
  });
});
