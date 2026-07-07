import { describe, expect, it } from "vitest";
import {
  extrairAlocacao,
  extrairInsumos,
  extrairProdutos,
  reconciliar,
  type Planilha,
} from "../../lib/import";

// Planilha sintética em memória (não depende do arquivo real do cliente).
// Mapa: "aba" -> "linha,coluna" -> valor. 1-indexado, como no Excel.
function criarPlanilha(dados: Record<string, Record<string, string | number>>): Planilha {
  const maxPorAba = new Map<string, { linhas: number; colunas: number }>();
  for (const [aba, celulas] of Object.entries(dados)) {
    let linhas = 0;
    let colunas = 0;
    for (const chave of Object.keys(celulas)) {
      const [l, c] = chave.split(",").map(Number);
      linhas = Math.max(linhas, l);
      colunas = Math.max(colunas, c);
    }
    maxPorAba.set(aba, { linhas, colunas });
  }
  return {
    abas: () => Object.keys(dados),
    dimensoes: (aba) => maxPorAba.get(aba) ?? { linhas: 0, colunas: 0 },
    valor: (aba, linha, coluna) => dados[aba]?.[`${linha},${coluna}`] ?? null,
  };
}

// Monta uma planilha mínima com 2 insumos e 4 produtos cobrindo cada status.
function planilhaExemplo(): Planilha {
  const input: Record<string, number | string> = {};
  // Insumos (linha 4 = A, linha 5 = B)
  // A: preço 100, ICMS 18%, PIS 9,25% -> sem imposto 72,75
  input["4,2"] = "Insumo A"; input["4,4"] = 0.18; input["4,5"] = 0.0925; input["4,6"] = 100; input["4,7"] = 72.75;
  // B: preço 10, sem imposto (0%) -> 10
  input["5,2"] = "Insumo B"; input["5,4"] = 0; input["5,5"] = 0; input["5,6"] = 10; input["5,7"] = 10;

  // Produtos: blocos em col 8, 11, 14, 17. Nome na linha 2; Qtd na col, Custo na col+1.
  // P1 "Produto Bom": A×0,5 (custo 36,375) + B×1 (10) = 46,375 (motor = custo = alocação) -> ok
  input["2,8"] = "Produto Bom"; input["4,8"] = 0.5; input["4,9"] = 36.375; input["5,8"] = 1; input["5,9"] = 10;
  // P2 "Produto Especial": A×1, mas Custo na planilha = 5 (fórmula especial). motor=72,75, custo=5 -> modelo_divergente
  input["2,11"] = "Produto Especial"; input["4,11"] = 1; input["4,12"] = 5;
  // P3 "Produto Grafia": B×1. Na Alocação o nome tem espaço duplo -> sem_alocacao + recuperável
  input["2,14"] = "Produto Grafia"; input["5,14"] = 1; input["5,15"] = 10;
  // P4 "Produto Lookup": B×1 (custo 10), mas Alocação Input = 20 -> lookup_divergente
  input["2,17"] = "Produto Lookup"; input["5,17"] = 1; input["5,18"] = 10;

  const aloc: Record<string, number | string> = {};
  aloc["1,2"] = "Item"; // cabeçalho
  aloc["2,2"] = "Produto Bom"; aloc["2,3"] = 46.375; aloc["2,4"] = 100; aloc["2,5"] = 10; aloc["2,7"] = 0.4; aloc["2,8"] = 180000;
  aloc["3,2"] = "Produto Especial"; aloc["3,3"] = 5; aloc["3,4"] = 100; aloc["3,5"] = 10; aloc["3,7"] = 0.4; aloc["3,8"] = 180000;
  aloc["4,2"] = "produto  grafia"; aloc["4,3"] = 10; aloc["4,4"] = 100; aloc["4,5"] = 5; aloc["4,7"] = 0.1; aloc["4,8"] = 45000;
  aloc["5,2"] = "Produto Lookup"; aloc["5,3"] = 20; aloc["5,4"] = 100; aloc["5,5"] = 5; aloc["5,7"] = 0.1; aloc["5,8"] = 45000;
  // Linha de resumo TOTAL — deve ser IGNORADA (senão infla os totais)
  aloc["6,2"] = "TOTAL"; aloc["6,4"] = 400; aloc["6,5"] = 30; aloc["6,6"] = 999999; aloc["6,7"] = 1; aloc["6,8"] = 450000;

  return criarPlanilha({ "Input Preço": input, "Alocação Despesa": aloc });
}

describe("importação — reconciliação da planilha", () => {
  const p = planilhaExemplo();
  const insumos = extrairInsumos(p);
  const produtos = extrairProdutos(p, insumos);
  const alocacao = extrairAlocacao(p);
  const r = reconciliar(insumos, produtos, alocacao);

  it("lê 2 insumos e 4 produtos", () => {
    expect(insumos).toHaveLength(2);
    expect(produtos).toHaveLength(4);
  });

  it("ignora a linha de resumo TOTAL na Alocação", () => {
    expect(alocacao).toHaveLength(4); // 4 produtos, sem o TOTAL
    expect(r.alocacao.totalProdutos).toBe(4);
    // Somas não são infladas pela linha de resumo
    expect(r.alocacao.somaParticipacoes.toNumber()).toBeCloseTo(1.0, 6); // 100%
    expect(r.alocacao.somaDespesaAlocada.toString()).toBe("450000");
  });

  it("classifica cada produto no status certo", () => {
    const porNome = new Map(r.linhas.map((l) => [l.nome, l.status]));
    expect(porNome.get("Produto Bom")).toBe("ok");
    expect(porNome.get("Produto Especial")).toBe("modelo_divergente");
    expect(porNome.get("Produto Lookup")).toBe("lookup_divergente");
    expect(porNome.get("Produto Grafia")).toBe("sem_alocacao");
  });

  it("detecta produto recuperável só por grafia", () => {
    expect(r.recuperaveisPorGrafia).toEqual([{ input: "Produto Grafia", alocacao: "produto  grafia" }]);
  });

  it("Camada 1 sem divergências quando os preços sem imposto batem", () => {
    expect(r.divergenciasLayer1).toHaveLength(0);
  });
});
