import { describe, expect, it } from "vitest";
import { descricaoNFdoProduto, origemDaDescricaoNF } from "../../lib/nomenclatura/descricaoNF";

// Todos os nomes de entrada abaixo são nomes reais do catálogo da Intertech,
// um por regra combinada em 04/08/2026. Se algum deles quebrar, a nota fiscal
// sai com o nome errado — por isso ficam travados aqui.
describe("descrição de NF dos campos cirúrgicos", () => {
  it.each([
    // Campo Catarata → com Adesivo e Bag. Gramatura e origem "China" somem.
    ["Campo Catarata 1,00 x 1,20 GR40", "Campo Cirúrgico com Adesivo e Bag 1,00 x 1,20"],
    ["Campo Catarata 0,60 x 0,60 GR30 Não Estéril", "Campo Cirúrgico com Adesivo e Bag 0,60 x 0,60 Não Estéril"],
    ["Campo Catarata 1,00 x 1,20 GR30 China", "Campo Cirúrgico com Adesivo e Bag 1,00 x 1,20"],
    ["Campo Catarata 0,80 x 0,80 GR30 Não Estéril China", "Campo Cirúrgico com Adesivo e Bag 0,80 x 0,80 Não Estéril"],

    // Campo com Fenestra → com Fenestra. Gramatura e TNT somem; Tape fica.
    ["Campo Com Fenestra 1,00 x 1,20 GR40", "Campo Cirúrgico com Fenestra 1,00 x 1,20"],
    ["Campo com Fenestra TNT GR 30 1,40 x 0,60 Não Estéril", "Campo Cirúrgico com Fenestra 1,40 x 0,60 Não Estéril"],
    ["Campo com Fenestra TNT 1,40 x 0,60", "Campo Cirúrgico com Fenestra 1,40 x 0,60"],
    ["Campo Com Fenestra 0,80 x 0,80 + Tape 20cm Não Estéril GR30", "Campo Cirúrgico com Fenestra 0,80 x 0,80 + Tape 20cm Não Estéril"],

    // Campo Com Adesivo → com Adesivo (só ganha "Cirúrgico"; gramatura some).
    ["Campo Com Adesivo 1,00 x 1,20 GR30", "Campo Cirúrgico com Adesivo 1,00 x 1,20"],
    ["Campo Com Adesivo 0,80 x 0,80 Não Estéril GR40", "Campo Cirúrgico com Adesivo 0,80 x 0,80 Não Estéril"],

    // Campo de Mesa → com Reforço. Não tem gramatura no catálogo.
    ["Campo de Mesa 0,70 x 0,70", "Campo Cirúrgico com Reforço 0,70 x 0,70"],
    ["Campo de Mesa 1,50 x 1,50  + Tape 1m Não Estéril", "Campo Cirúrgico com Reforço 1,50 x 1,50 + Tape 1m Não Estéril"],
    ["Campo de mesa 1,00x1,40 Adesivo 14x15 +Fen", "Campo Cirúrgico com Reforço 1,00x1,40 Adesivo 14x15 +Fen"],
    ["Campo de Mesa 2,00 x 3,00 com Fenestra + Tape 40cm", "Campo Cirúrgico com Reforço 2,00 x 3,00 com Fenestra + Tape 40cm"],

    // Campo Lasik → com Adesivo e 2 Bags. "GR 30"/"GR 40" separados somem.
    ["Campo Lasik Binocular 1,00 X 1,20 2 Bags GR 40", "Campo Cirúrgico com Adesivo e 2 Bags Binocular 1,00 X 1,20 2 Bags"],
    ["Campo Lasik Monocular Não Estéril", "Campo Cirúrgico com Adesivo e 2 Bags Monocular Não Estéril"],

    // Campo Simples → Sem Fenestra.
    ["Campo Simples 1,00 x 1,20 GR40", "Campo Cirúrgico Sem Fenestra 1,00 x 1,20"],
    ["Campo Simples 1,00 x 1,40 GR30 Não Estéril", "Campo Cirúrgico Sem Fenestra 1,00 x 1,40 Não Estéril"],
    ["Campo Simples 1,50 x 1,80 + Tape 1,5m Não Estéril GR40", "Campo Cirúrgico Sem Fenestra 1,50 x 1,80 + Tape 1,5m Não Estéril"],

    // Steri Drape → prefixo "Campo Cirúrgico" e tamanho abreviado.
    ["Steri Drape Grande", "Campo Cirúrgico Steri Drape G"],
    ["Steri Drape Grande Não Estéril", "Campo Cirúrgico Steri Drape G Não Estéril"],
    ["Steri Drape Pequeno", "Campo Cirúrgico Steri Drape P"],
    ["Steri Drape Pequeno Não Estéril", "Campo Cirúrgico Steri Drape P Não Estéril"],

    // Campos sem família própria: ganham só a palavra "Cirúrgico".
    ["Campo Lateral 1,00 x 1,60", "Campo Cirúrgico Lateral 1,00 x 1,60"],
    ["Campo Superior 1,60 x 2,60 Laminado Não Estéril", "Campo Cirúrgico Superior 1,60 x 2,60 Laminado Não Estéril"],
    ["Campo Inferior Laminado 1,60 x 2,00", "Campo Cirúrgico Inferior Laminado 1,60 x 2,00"],
    ["Campo de Mayo Não Estéril", "Campo Cirúrgico de Mayo Não Estéril"],
    ["Campo 1,60 x 2,00 Laminado Fenestra U", "Campo Cirúrgico 1,60 x 2,00 Laminado Fenestra U"],
  ])("%s → %s", (nome, esperado) => {
    expect(descricaoNFdoProduto(nome)).toBe(esperado);
  });

  it("não inventa descrição para produto que não é campo cirúrgico", () => {
    expect(descricaoNFdoProduto("Avental TNT Sem Manga Não Estéril")).toBeNull();
    expect(descricaoNFdoProduto("Conjunto Cirúrgico M")).toBeNull();
    expect(descricaoNFdoProduto("")).toBeNull();
  });

  it("família específica vence a genérica", () => {
    // Se "Campo" genérico fosse testado antes, viraria "Campo Cirúrgico Simples…".
    expect(descricaoNFdoProduto("Campo Simples 0,40 x 0,40 GR40")).toBe(
      "Campo Cirúrgico Sem Fenestra 0,40 x 0,40"
    );
  });

  it("nenhuma descrição de campo mantém gramatura, TNT, SMS ou origem", () => {
    const nomes = [
      "Campo Simples 1,00 x 1,20 GR40",
      "Campo com Fenestra TNT GR 30 1,40 x 0,60",
      "Campo Catarata 1,00 x 1,20 GR30 China",
      "Campo Lasik Binocular 1,00 X 1,20 2 Bags GR 30 Não Estéril",
    ];
    for (const nome of nomes) {
      const descricao = descricaoNFdoProduto(nome)!;
      expect(descricao).not.toMatch(/\bGR\s?\d+\b/i);
      expect(descricao).not.toMatch(/\bTNT\b|\bSMS\b|\bChina\b/i);
      expect(descricao).not.toMatch(/\s{2,}/);
    }
  });
});

describe("origem da descrição de NF", () => {
  const nome = "Campo Simples 1,00 x 1,20 GR40";

  it("texto igual ao da regra é 'regra'", () => {
    expect(origemDaDescricaoNF(nome, "Campo Cirúrgico Sem Fenestra 1,00 x 1,20")).toBe("regra");
  });

  it("texto ajustado à mão é 'manual' e não será sobrescrito", () => {
    expect(origemDaDescricaoNF(nome, "Campo Cirúrgico Sem Fenestra 100x120cm")).toBe("manual");
  });

  it("texto vazio não tem origem", () => {
    expect(origemDaDescricaoNF(nome, "   ")).toBeNull();
  });
});
