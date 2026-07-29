import { describe, expect, it } from "vitest";
import { podeAprovar, podeVerNumerosDeMargem, type ParametrosAprovacao } from "@app/lib/sim/aprovacao";

const PADRAO: ParametrosAprovacao = {
  approver_roles: ["admin", "financeiro"],
  require_approval: true,
  block_below_margin: null,
  hide_margin_numbers_from_sales: true,
};

describe("visibilidade da margem", () => {
  it("esconde os números do Comercial, que é quem negocia o desconto", () => {
    expect(podeVerNumerosDeMargem("comercial", PADRAO)).toBe(false);
  });

  it("mostra os números para quem aprova e para o Financeiro", () => {
    expect(podeVerNumerosDeMargem("admin", PADRAO)).toBe(true);
    expect(podeVerNumerosDeMargem("financeiro", PADRAO)).toBe(true);
  });

  it("o Administrador pode liberar os números para todos", () => {
    const liberado = { ...PADRAO, hide_margin_numbers_from_sales: false };
    expect(podeVerNumerosDeMargem("comercial", liberado)).toBe(true);
  });

  it("sem perfil identificado, não mostra nada", () => {
    expect(podeVerNumerosDeMargem(null, PADRAO)).toBe(false);
    expect(podeVerNumerosDeMargem(undefined, PADRAO)).toBe(false);
  });
});

describe("quem aprova", () => {
  it("é definido por perfil, não por pessoa", () => {
    expect(podeAprovar("admin", PADRAO)).toBe(true);
    expect(podeAprovar("financeiro", PADRAO)).toBe(true);
    expect(podeAprovar("comercial", PADRAO)).toBe(false);
    expect(podeAprovar("producao", PADRAO)).toBe(false);
  });

  it("acompanha a configuração quando ela muda", () => {
    const soAdmin: ParametrosAprovacao = { ...PADRAO, approver_roles: ["admin"] };
    expect(podeAprovar("financeiro", soAdmin)).toBe(false);
    expect(podeAprovar("admin", soAdmin)).toBe(true);

    const comComercial: ParametrosAprovacao = { ...PADRAO, approver_roles: ["admin", "comercial"] };
    expect(podeAprovar("comercial", comComercial)).toBe(true);
  });

  it("sem parâmetros carregados, ninguém aprova", () => {
    expect(podeAprovar("admin", undefined)).toBe(false);
  });
});
