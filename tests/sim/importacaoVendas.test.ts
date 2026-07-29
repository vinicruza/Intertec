import { describe, expect, it } from "vitest";
import { lerNumero, lerRelatorioDeVendas } from "@app/lib/sim/importacaoVendas";

// Leitura do relatório de vendas do ERP (reunião Intertech 16/07/2026).
// O formato exato ainda não foi confirmado, então o leitor precisa aguentar
// as variações comuns de exportação — e nunca engolir linha em silêncio.

describe("leitura de número", () => {
  it("entende o padrão brasileiro", () => {
    expect(lerNumero("1.234,56")).toBe("1234.56");
    expect(lerNumero("0,5")).toBe("0.5");
    expect(lerNumero("R$ 1.200,00")).toBe("1200.00");
  });

  it("entende o padrão americano", () => {
    expect(lerNumero("1,234.56")).toBe("1234.56");
    expect(lerNumero("1234.56")).toBe("1234.56");
  });

  it("devolve nulo para o que não é número", () => {
    expect(lerNumero("")).toBeNull();
    expect(lerNumero("   ")).toBeNull();
    expect(lerNumero("abc")).toBeNull();
    expect(lerNumero("12,34,56")).toBeNull();
  });
});

describe("leitura do relatório", () => {
  it("lê arquivo com cabeçalho e ponto e vírgula", () => {
    const r = lerRelatorioDeVendas(
      [
        "Codigo;Descricao;Quantidade;Valor",
        "PC-0001;Avental GG;4000;16.800,00",
        "CC-0002;Campo catarata;150;1.200,50",
      ].join("\n")
    );

    expect(r.problemas).toHaveLength(0);
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]).toEqual({
      codigo: "PC-0001",
      descricao: "Avental GG",
      quantidade: "4000",
      receita: "16800.00",
    });
    expect(r.linhas[1].receita).toBe("1200.50");
  });

  it("lê arquivo sem cabeçalho, na ordem código, descrição, quantidade, receita", () => {
    const r = lerRelatorioDeVendas("PC-0001;Avental;10;100,00");
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].codigo).toBe("PC-0001");
    expect(r.linhas[0].quantidade).toBe("10");
  });

  it("aceita vírgula e tabulação como separador", () => {
    const comVirgula = lerRelatorioDeVendas("Codigo,Quantidade\nPC-0001,10");
    expect(comVirgula.linhas[0].quantidade).toBe("10");

    const comTab = lerRelatorioDeVendas("Codigo\tQuantidade\nPC-0001\t10");
    expect(comTab.linhas[0].quantidade).toBe("10");
  });

  it("respeita a ordem das colunas indicada no cabeçalho", () => {
    const r = lerRelatorioDeVendas("Quantidade;Codigo\n25;CC-0009");
    expect(r.linhas[0]).toMatchObject({ codigo: "CC-0009", quantidade: "25" });
  });

  it("reconhece cabeçalhos acentuados", () => {
    const r = lerRelatorioDeVendas("Código;Descrição;Quantidade\nPC-0001;Avental;7");
    expect(r.problemas).toHaveLength(0);
    expect(r.linhas[0]).toMatchObject({ codigo: "PC-0001", quantidade: "7", descricao: "Avental" });
  });

  it("normaliza o código para maiúsculas, como a conciliação espera", () => {
    const r = lerRelatorioDeVendas("Codigo;Quantidade\npc-0001;5");
    expect(r.linhas[0].codigo).toBe("PC-0001");
  });

  it("relata as linhas problemáticas em vez de descartá-las em silêncio", () => {
    const r = lerRelatorioDeVendas(
      [
        "Codigo;Quantidade",
        "PC-0001;10",
        ";50",           // sem código
        "CC-0002;abc",   // quantidade não numérica
        "AC-0003;0",     // quantidade zero
        "AC-0004;-5",    // quantidade negativa
      ].join("\n")
    );

    expect(r.linhas).toHaveLength(1);
    expect(r.problemas).toHaveLength(4);
    expect(r.problemas[0].motivo).toContain("Sem código");
    expect(r.problemas[1].motivo).toContain("não numérica");
    expect(r.problemas[2].motivo).toContain("zero ou negativa");
    // O número da linha aponta para o arquivo original, para achar o erro lá.
    expect(r.problemas[0].linha).toBe(3);
  });

  it("ignora linhas em branco e aspas em volta dos campos", () => {
    const r = lerRelatorioDeVendas(
      ['Codigo;Quantidade', '"PC-0001";"10"', "", "   ", '"CC-0002";"20"'].join("\n")
    );
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0].codigo).toBe("PC-0001");
  });

  it("arquivo vazio não quebra", () => {
    expect(lerRelatorioDeVendas("")).toEqual({ linhas: [], problemas: [] });
  });
});
