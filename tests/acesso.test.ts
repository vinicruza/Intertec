import { describe, expect, it } from "vitest";
import {
  MENU,
  menuDoPerfil,
  menuPorArea,
  nomePerfil,
  perfilPodeAcessar,
  type Perfil,
} from "@app/lib/roles";

// A matriz de acesso é uma regra de negócio, não detalhe de tela: se alguém
// mexer no menu e liberar uma área restrita por engano, estes testes quebram.

const RESTRITAS = ["/usuarios", "/cadastros", "/configuracoes", "/integridade"];
const OUTROS_PERFIS: Perfil[] = ["financeiro", "comercial", "producao"];

describe("área restrita ao Administrador", () => {
  it("só o Administrador acessa Usuários, Cadastros, Configurações e Integridade", () => {
    for (const caminho of RESTRITAS) {
      expect(perfilPodeAcessar("admin", caminho), caminho).toBe(true);
      for (const perfil of OUTROS_PERFIS) {
        expect(perfilPodeAcessar(perfil, caminho), `${perfil} em ${caminho}`).toBe(false);
      }
    }
  });

  it("as telas restritas estão todas na área de Administração", () => {
    for (const caminho of RESTRITAS) {
      expect(MENU.find((i) => i.caminho === caminho)?.area, caminho).toBe("administracao");
    }
  });

  it("nenhum item da área de Administração é visível a outro perfil", () => {
    for (const item of MENU.filter((i) => i.area === "administracao")) {
      expect(item.perfis, item.caminho).toEqual(["admin"]);
    }
  });

  it("quem não é Administrador não vê nem o título da área restrita", () => {
    for (const perfil of OUTROS_PERFIS) {
      const areas = menuPorArea(perfil).map((g) => g.area);
      expect(areas, perfil).not.toContain("administracao");
    }
    expect(menuPorArea("admin").map((g) => g.area)).toEqual(["operacao", "administracao"]);
  });
});

describe("menu por perfil", () => {
  it("Comercial não enxerga insumos (regra de ouro: sem custo de insumo)", () => {
    expect(perfilPodeAcessar("comercial", "/insumos")).toBe(false);
  });

  it("todo perfil enxerga Meu perfil, para poder trocar a própria senha", () => {
    for (const perfil of [...OUTROS_PERFIS, "admin" as Perfil]) {
      expect(menuDoPerfil(perfil).map((i) => i.caminho), perfil).toContain("/perfil");
    }
  });

  it("não há caminho repetido no menu", () => {
    const caminhos = MENU.map((i) => i.caminho);
    expect(new Set(caminhos).size).toBe(caminhos.length);
  });

  it("caminho desconhecido é negado por padrão", () => {
    expect(perfilPodeAcessar("admin", "/tela-que-nao-existe")).toBe(false);
  });
});

describe("item oculto do menu (DRE mensal — decisão do cliente, 30/07/2026)", () => {
  it("some do menu, mas continua acessível por URL a quem tem perfil", () => {
    expect(menuDoPerfil("admin").map((i) => i.caminho)).not.toContain("/dre");
    expect(menuDoPerfil("financeiro").map((i) => i.caminho)).not.toContain("/dre");
    expect(perfilPodeAcessar("admin", "/dre")).toBe(true);
    expect(perfilPodeAcessar("financeiro", "/dre")).toBe(true);
    expect(perfilPodeAcessar("comercial", "/dre")).toBe(false);
  });
});

describe("nome do perfil", () => {
  it("distingue o dono do sistema do Administrador comum", () => {
    expect(nomePerfil("admin")).toBe("Administrador");
    expect(nomePerfil("admin", true)).toBe("Super Administrador");
    expect(nomePerfil("financeiro")).toBe("Financeiro");
  });
});
