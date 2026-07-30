import { describe, expect, it } from "vitest";
import { SENHA_MINIMA, senhaAceitavel, senhaSugerida } from "@app/lib/senha";

describe("senha provisória sugerida", () => {
  it("é longa o suficiente para o próprio limite do sistema", () => {
    expect(senhaSugerida().length).toBeGreaterThanOrEqual(SENHA_MINIMA);
  });

  it("não usa caracteres que se confundem ao ditar ou copiar (0 O 1 l I)", () => {
    // 200 sorteios: se algum desses caracteres estivesse no alfabeto, apareceria.
    const tudo = Array.from({ length: 200 }, () => senhaSugerida()).join("");
    expect(tudo).not.toMatch(/[0O1lI]/);
    expect(tudo).toMatch(/^[A-Za-z2-9]+$/);
  });

  it("não repete", () => {
    const sorteios = new Set(Array.from({ length: 50 }, () => senhaSugerida()));
    expect(sorteios.size).toBe(50);
  });
});

describe("senha aceitável", () => {
  it("recusa senha curta e aceita a partir do mínimo", () => {
    expect(senhaAceitavel("a".repeat(SENHA_MINIMA - 1))).toBe(false);
    expect(senhaAceitavel("a".repeat(SENHA_MINIMA))).toBe(true);
  });
});
