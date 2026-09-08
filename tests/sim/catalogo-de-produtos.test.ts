import { describe, expect, it } from "vitest";
import {
  confirmacaoDeExclusaoDoProduto,
  confirmacaoDeStatusDoProduto,
  ondeOProdutoEUsado,
  podeExcluirProduto,
  podeInativarProduto,
  produtoPodeSerExcluido,
  type UsoDoProdutoResumo,
} from "@app/lib/sim/catalogoDeProdutos";

// ============================================================
// Inativar e excluir produto (pedido da Patricia, 08/09/2026)
// ============================================================
//
// "Pode liberar no acesso de administrador o cancelamento ou exclusão de
// produtos." São duas portas com riscos diferentes, e tratá-las como uma só
// seria o caminho mais curto para alguém apagar um produto que está dentro de
// pedido fechado.

const NUNCA_USADO: UsoDoProdutoResumo = {
  emPedidos: 0,
  emKits: 0,
  emFichas: 0,
  emVendas: 0,
  emDespesas: 0,
};

describe("quem pode o quê", () => {
  it("inativar é de Administrador e Financeiro", () => {
    expect(podeInativarProduto("admin")).toBe(true);
    expect(podeInativarProduto("financeiro")).toBe(true);
    expect(podeInativarProduto("comercial")).toBe(false);
    expect(podeInativarProduto("producao")).toBe(false);
  });

  // Apagar é a única operação sem volta do sistema.
  it("excluir é SÓ do Administrador", () => {
    expect(podeExcluirProduto("admin")).toBe(true);
    expect(podeExcluirProduto("financeiro")).toBe(false);
    expect(podeExcluirProduto("comercial")).toBe(false);
    expect(podeExcluirProduto(null)).toBe(false);
  });
});

describe("o que impede excluir", () => {
  it("produto que nunca andou pode ser excluído", () => {
    expect(produtoPodeSerExcluido(NUNCA_USADO)).toBe(true);
    expect(ondeOProdutoEUsado(NUNCA_USADO)).toEqual([]);
  });

  // Cada um destes é um lugar onde apagar o produto levaria junto o passado
  // que o menciona.
  it.each([
    ["pedido", { emPedidos: 1 }],
    ["kit", { emKits: 1 }],
    ["ficha de outro produto", { emFichas: 1 }],
    ["venda importada", { emVendas: 1 }],
    ["rateio de despesa", { emDespesas: 1 }],
  ])("usado em %s: não pode ser excluído", (_onde, uso) => {
    expect(produtoPodeSerExcluido({ ...NUNCA_USADO, ...uso })).toBe(false);
  });

  it("a frase de uso lista todos os lugares, não só o primeiro", () => {
    const onde = ondeOProdutoEUsado({ ...NUNCA_USADO, emPedidos: 3, emKits: 2, emVendas: 7 });
    expect(onde).toHaveLength(3);
    expect(onde.join(", ")).toContain("3 pedido(s)");
    expect(onde.join(", ")).toContain("2 kit(s)");
    expect(onde.join(", ")).toContain("7 venda(s) importada(s)");
  });
});

describe("o que a confirmação diz", () => {
  it("ao inativar, promete que nada é apagado e que dá para reativar", () => {
    const texto = confirmacaoDeStatusDoProduto({
      ativando: false,
      codigo: "AV0005",
      nome: "Avental G Não Estéril",
      uso: NUNCA_USADO,
    });
    expect(texto).toContain("AV0005");
    expect(texto).toContain("Nada é apagado");
    expect(texto).toContain("reativar");
  });

  // O caso que morde: um kit ATIVO cujo produto foi inativado continua
  // vendável, e o custo dele segue vindo desse produto. Inativar o produto não
  // tira o kit de venda — e quem clica precisa saber disso ANTES.
  it("avisa quando o produto está dentro de kits", () => {
    const texto = confirmacaoDeStatusDoProduto({
      ativando: false,
      codigo: "CM0012",
      nome: "Campo de Mesa",
      uso: { ...NUNCA_USADO, emKits: 3 },
    });
    expect(texto).toContain("3 kit(s)");
    expect(texto).toContain("continuam à venda");
  });

  it("ao reativar, não repete os avisos da inativação", () => {
    const texto = confirmacaoDeStatusDoProduto({
      ativando: true,
      codigo: "CM0012",
      nome: "Campo de Mesa",
      uso: { ...NUNCA_USADO, emKits: 3 },
    });
    expect(texto).toContain("Reativar");
    expect(texto).not.toContain("Atenção");
  });

  it("a exclusão diz que não tem volta e aponta a saída mais branda", () => {
    const texto = confirmacaoDeExclusaoDoProduto({ codigo: "XX0001", nome: "Digitado errado" });
    expect(texto).toContain("EXCLUIR");
    expect(texto).toContain("não tem volta");
    expect(texto).toContain("Inativar");
  });
});
