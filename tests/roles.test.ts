import { describe, expect, it } from "vitest";
import { MENU, menuDoPerfil, perfilPodeAcessar } from "../app/lib/roles";

// O menu esconde o que o perfil não pode ver; o RLS no banco é a garantia
// real. Estes testes travam as decisões de acesso que têm razão de negócio,
// para que uma alteração de menu não as desfaça sem querer.

describe("Comercial não enxerga custo de insumo (PRD §4)", () => {
  it("não acessa a tela de insumos", () => {
    expect(perfilPodeAcessar("comercial", "/insumos")).toBe(false);
  });

  it("não acessa a memória de cálculo, que abre o preço dos insumos", () => {
    // Se um dia liberarem esta rota para o Comercial, o RLS filtra `inputs` e
    // a tela mostraria custo ZERADO — o erro que o sistema existe para
    // extinguir. Por isso ela acompanha exatamente os perfis de /insumos.
    expect(perfilPodeAcessar("comercial", "/como-e-calculado")).toBe(false);
  });

  it("a memória de cálculo tem os mesmos perfis da tela de insumos", () => {
    const insumos = MENU.find((m) => m.caminho === "/insumos")!;
    const memoria = MENU.find((m) => m.caminho === "/como-e-calculado")!;
    expect([...memoria.perfis].sort()).toEqual([...insumos.perfis].sort());
  });

  it("mas o Comercial continua simulando pedidos e vendo produtos", () => {
    expect(perfilPodeAcessar("comercial", "/simulador")).toBe(true);
    expect(perfilPodeAcessar("comercial", "/produtos")).toBe(true);
  });
});

describe("menuDoPerfil", () => {
  it("Administrador vê tudo", () => {
    expect(menuDoPerfil("admin")).toHaveLength(MENU.length);
  });

  it("Produção enxerga a memória de cálculo (consulta, sem edição)", () => {
    const caminhos = menuDoPerfil("producao").map((m) => m.caminho);
    expect(caminhos).toContain("/como-e-calculado");
  });

  it("Produção não vê DRE nem configurações", () => {
    const caminhos = menuDoPerfil("producao").map((m) => m.caminho);
    expect(caminhos).not.toContain("/dre");
    expect(caminhos).not.toContain("/configuracoes");
  });

  it("rota desconhecida nunca é liberada", () => {
    expect(perfilPodeAcessar("admin", "/rota-inexistente")).toBe(false);
  });
});
