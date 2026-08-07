import { describe, expect, it } from "vitest";
import { perfilPodeEditarProduto, type Perfil } from "@app/lib/roles";

describe("permissões de produtos e fichas", () => {
  it("mantém edição de fichas alinhada com a escrita liberada no RLS", () => {
    const esperados: Record<Perfil, boolean> = {
      admin: true,
      financeiro: true,
      comercial: false,
      producao: false,
    };

    for (const perfil of Object.keys(esperados) as Perfil[]) {
      expect(perfilPodeEditarProduto(perfil)).toBe(esperados[perfil]);
    }
  });
});
