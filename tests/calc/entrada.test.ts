import { describe, expect, it } from "vitest";
import { lerValor, lerValorNaoNegativo, lerValorPositivo } from "@calc";

// Leitura de valores digitados: campo vazio ou inválido nunca vira zero em
// silêncio (Calculations.md §9, classes de erro 3 e 4 da planilha).

describe("lerValor — escrita pt-BR", () => {
  it("aceita vírgula decimal", () => {
    const r = lerValor("1234,56", "o frete");
    expect(r.ok && r.valor.toString()).toBe("1234.56");
  });

  it("aceita ponto de milhar com vírgula decimal", () => {
    const r = lerValor("1.234,56", "o frete");
    expect(r.ok && r.valor.toString()).toBe("1234.56");
  });

  it("aceita ponto decimal (formato do banco)", () => {
    const r = lerValor("1234.56", "o frete");
    expect(r.ok && r.valor.toString()).toBe("1234.56");
  });

  it("ignora espaços em volta", () => {
    const r = lerValor("  42  ", "o frete");
    expect(r.ok && r.valor.toString()).toBe("42");
  });
});

describe("lerValor — recusa em vez de zerar", () => {
  it("campo vazio devolve motivo, não zero", () => {
    const r = lerValor("", "o frete");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toBe("Informe o frete.");
  });

  it("só espaços também é vazio", () => {
    expect(lerValor("   ", "o frete").ok).toBe(false);
  });

  it("texto sem sentido é inválido", () => {
    const r = lerValor("abc", "o frete");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toContain("inválido");
  });

  it("vírgulas demais são inválidas", () => {
    expect(lerValor("1,2,3", "o frete").ok).toBe(false);
  });

  it("Infinity e NaN não são dinheiro", () => {
    expect(lerValor("Infinity", "o frete").ok).toBe(false);
    expect(lerValor("NaN", "o frete").ok).toBe(false);
  });
});

describe("lerValorNaoNegativo — frete", () => {
  it("zero digitado é resposta válida", () => {
    const r = lerValorNaoNegativo("0", "o frete");
    expect(r.ok && r.valor.isZero()).toBe(true);
  });

  it("negativo é recusado", () => {
    const r = lerValorNaoNegativo("-10", "o frete");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toBe("o frete não pode ser negativo.");
  });

  it("campo vazio continua recusado (não vira zero)", () => {
    expect(lerValorNaoNegativo("", "o frete").ok).toBe(false);
  });
});

describe("lerValorPositivo — denominadores (rendimento, tamanho de lote)", () => {
  it("aceita valor maior que zero", () => {
    const r = lerValorPositivo("0,99", "o rendimento");
    expect(r.ok && r.valor.toString()).toBe("0.99");
  });

  it("recusa zero — viraria divisão por zero", () => {
    const r = lerValorPositivo("0", "o rendimento");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toBe("o rendimento deve ser maior que zero.");
  });

  it("recusa negativo", () => {
    expect(lerValorPositivo("-1", "o tamanho do lote").ok).toBe(false);
  });

  it("espelha as constraints do banco (yield_rate > 0, lot_size > 0)", () => {
    expect(lerValorPositivo("150", "o tamanho do lote").ok).toBe(true);
    expect(lerValorPositivo("0", "o tamanho do lote").ok).toBe(false);
  });
});
