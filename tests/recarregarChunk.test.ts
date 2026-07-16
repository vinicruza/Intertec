import { describe, expect, it } from "vitest";
import { ehErroDeChunk } from "../app/lib/recarregarChunk";

describe("detecção de erro de chunk (stale deploy)", () => {
  it("reconhece as mensagens de import dinâmico ausente", () => {
    const casos = [
      "Failed to fetch dynamically imported module: https://x/assets/ShellLayout-CMhQLSAs.js",
      "error loading dynamically imported module",
      "Importing a module script failed.",
      "Failed to load module script: ...",
    ];
    for (const msg of casos) {
      expect(ehErroDeChunk(new Error(msg))).toBe(true);
      expect(ehErroDeChunk(msg)).toBe(true);
    }
  });

  it("não confunde erros comuns da aplicação com falha de chunk", () => {
    expect(ehErroDeChunk(new Error("Usuário sem tenant ativo"))).toBe(false);
    expect(ehErroDeChunk(new Error("Já existe um kit com esta composição"))).toBe(false);
    expect(ehErroDeChunk(null)).toBe(false);
    expect(ehErroDeChunk(undefined)).toBe(false);
  });
});
