import { describe, expect, it } from "vitest";
import { descricaoNFdoProduto, origemDaDescricaoNF, type FamiliaNF } from "../../lib/nomenclatura/descricaoNF";
import { FAMILIAS_INICIAIS } from "../../lib/nomenclatura/familiasIniciais";

// Toda a suíte roda contra a configuração de partida — a mesma que a migração
// semeia em nf_naming_rules. Se a tela alterar a regra, é a tela que muda o
// resultado; aqui fica travado o comportamento combinado com o cliente.
const F = FAMILIAS_INICIAIS;
const descricao = (nome: string, familias: FamiliaNF[] = F) => descricaoNFdoProduto(nome, familias);

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
    expect(descricao(nome)).toBe(esperado);
  });

  it("nome vazio não tem descrição", () => {
    expect(descricao("")).toBeNull();
    expect(descricao("   ")).toBeNull();
  });

  it("família específica vence a genérica", () => {
    // Se "Campo" genérico fosse testado antes, viraria "Campo Cirúrgico Simples…".
    expect(descricao("Campo Simples 0,40 x 0,40 GR40")).toBe(
      "Campo Cirúrgico Sem Fenestra 0,40 x 0,40"
    );
  });

  it("quem manda na prioridade é a ordem, não a posição na lista", () => {
    // A tela devolve as famílias na ordem que quiser; o campo "ordem" é a
    // verdade. Embaralhada, a genérica continua perdendo para a específica.
    const embaralhada = [...F].reverse();
    expect(descricao("Campo Simples 0,40 x 0,40 GR40", embaralhada)).toBe(
      "Campo Cirúrgico Sem Fenestra 0,40 x 0,40"
    );
  });

  it("mudar o nome fiscal de uma família muda só os produtos dela", () => {
    // É isto que a tela de Cadastros faz — a regra não está mais no código.
    const outra = F.map((f) =>
      f.comeco === "Campo de Mesa" ? { ...f, nomeNF: "Campo Cirúrgico Reforçado" } : f
    );
    expect(descricao("Campo de Mesa 0,70 x 0,70", outra)).toBe(
      "Campo Cirúrgico Reforçado 0,70 x 0,70"
    );
    expect(descricao("Campo Simples 0,40 x 0,40 GR40", outra)).toBe(
      "Campo Cirúrgico Sem Fenestra 0,40 x 0,40"
    );
  });

  it("uma troca com destino vazio apaga a palavra", () => {
    const semLaminado = F.map((f) =>
      f.comeco === "Campo" ? { ...f, trocas: [{ de: "Laminado", para: "" }] } : f
    );
    expect(descricao("Campo Inferior Laminado 1,60 x 2,00", semLaminado)).toBe(
      "Campo Cirúrgico Inferior 1,60 x 2,00"
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
      const saida = descricao(nome)!;
      expect(saida).not.toMatch(/\bGR\s?\d+\b/i);
      expect(saida).not.toMatch(/\bTNT\b|\bSMS\b|\bChina\b/i);
      expect(saida).not.toMatch(/\s{2,}/);
    }
  });
});

// Segunda rodada: aventais, Compressa Wiper e o resto do catálogo.
describe("descrição de NF do resto do catálogo", () => {
  it.each([
    // Avental → Avental Cirúrgico. Tamanho, Laminado e Compressa continuam.
    ["Avental", "Avental Cirúrgico"],
    ["Avental Não Estéril", "Avental Cirúrgico Não Estéril"],
    ["Avental G", "Avental Cirúrgico G"],
    ["Avental EGG Não Estéril", "Avental Cirúrgico EGG Não Estéril"],
    ["Avental G Laminado", "Avental Cirúrgico G Laminado"],
    ["Avental com Compressa", "Avental Cirúrgico com Compressa"],
    ["Avental GG com Compressa Não Estéril", "Avental Cirúrgico GG com Compressa Não Estéril"],

    // Tag vira Toalha.
    ["Avental M com Tag", "Avental Cirúrgico M com Toalha"],
    ["Avental EGG com Compressa e Tag", "Avental Cirúrgico EGG com Compressa e Toalha"],
    ["Avental Laminado com Tag Não Estéril", "Avental Cirúrgico Laminado com Toalha Não Estéril"],

    // Gineco é avental sem manga.
    ["Avental Gineco", "Avental Cirúrgico Sem Manga"],
    ["Avental Gineco Não Estéril", "Avental Cirúrgico Sem Manga Não Estéril"],

    // TNT some do avental; gramatura "30g"/"40g" também.
    ["Avental TNT Sem Manga", "Avental Cirúrgico Sem Manga"],
    ["Avental TNT Sem Manga Tam Especial Não Estéril", "Avental Cirúrgico Sem Manga Tam Especial Não Estéril"],
    ["Avental TNT 30g ML", "Avental Cirúrgico ML"],
    ["Avental TNT 40g ML Não Estéril", "Avental Cirúrgico ML Não Estéril"],

    // SMS, ao contrário do TNT, continua na nota.
    ["Avental Sem Manga SMS", "Avental Cirúrgico Sem Manga SMS"],
    ["Avental Sem Manga SMS Não Estéril", "Avental Cirúrgico Sem Manga SMS Não Estéril"],

    // Compressa Wiper vira Toalha de Mão; as outras compressas não mudam.
    ["Compressa Wiper", "Toalha de Mão"],
    ["Compressa Wiper Não Estéril", "Toalha de Mão Não Estéril"],
  ])("%s → %s", (nome, esperado) => {
    expect(descricao(nome)).toBe(esperado);
  });

  it.each([
    "Compressa Cremer Não Estéril",
    "Compressa G Pacote 10",
    "Compressa P Pacote 5 Não Estéril",
    "Compressa Pré-Lavada",
    "Conjunto G/GG TNT Não Estéril",
    "Conjunto P/M",
    "Kit Universal Com Avental",
    "Kit Catarata com 2 Não Estéril",
    "Bag Estéril",
    "Bota Não Estéril",
    "Oclusor",
    "Perneira Não Estéril",
    "Saco 0,60 x 0,90 Estéril",
  ])("o restante se mantém igual: %s", (nome) => {
    expect(descricao(nome)).toBe(nome);
  });

  it("o TNT do Conjunto continua na nota — a remoção é só dos aventais", () => {
    expect(descricao("Conjunto P/M TNT")).toBe("Conjunto P/M TNT");
    expect(descricao("Avental TNT Sem Manga")).toBe("Avental Cirúrgico Sem Manga");
  });

  it("'Kit Universal Com Avental' é kit, não avental", () => {
    // A família casa pelo começo do nome; "Avental" no meio não conta.
    expect(descricao("Kit Universal Sem Avental")).toBe("Kit Universal Sem Avental");
  });

  it("nenhuma descrição de avental mantém gramatura ou TNT", () => {
    const nomes = ["Avental TNT 30g ML", "Avental TNT 40g ML Não Estéril", "Avental TNT Sem Manga"];
    for (const nome of nomes) {
      const saida = descricao(nome)!;
      expect(saida).not.toMatch(/\bTNT\b/i);
      expect(saida).not.toMatch(/\b\d+\s?g\b|\bGR\s?\d+\b/i);
    }
  });
});

describe("origem da descrição de NF", () => {
  const nome = "Campo Simples 1,00 x 1,20 GR40";

  it("texto igual ao da regra é 'regra'", () => {
    expect(origemDaDescricaoNF(nome, "Campo Cirúrgico Sem Fenestra 1,00 x 1,20", F)).toBe("regra");
  });

  it("texto ajustado à mão é 'manual' e não será sobrescrito", () => {
    expect(origemDaDescricaoNF(nome, "Campo Cirúrgico Sem Fenestra 100x120cm", F)).toBe("manual");
  });

  it("texto vazio não tem origem", () => {
    expect(origemDaDescricaoNF(nome, "   ", F)).toBeNull();
  });
});
