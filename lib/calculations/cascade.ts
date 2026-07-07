import { Decimal, dec } from "./decimal";
import { precoSemImposto } from "./inputs";
import { resolverQuantidade, type Quantidade } from "./cmv";
import { ErroCalculoBloqueante, type EntradaDecimal } from "./types";

// ============================================================
// Recálculo de CMV em cascata (Calculations.md §4 + golden test T8)
// ============================================================
//
// Um produto pode ter, na ficha, componentes que são INSUMOS ou outros
// PRODUTOS (é assim que kits funcionam). Mudar o preço de um insumo deve
// recalcular o CMV de todos os produtos e kits que dependem dele, em cascata.
//
// Esta função calcula o CMV de todos os produtos de uma vez, resolvendo as
// dependências produto→produto por recursão memoizada, e barra referências
// circulares (A contém B que contém A) como erro bloqueante.

export type InsumoCascata = {
  id: string;
  precoComImposto: EntradaDecimal;
  icms: EntradaDecimal;
  pisCofins: EntradaDecimal;
};

export type ComponenteRef =
  | { tipo: "insumo"; insumoId: string; quantidade: Quantidade }
  | { tipo: "produto"; produtoId: string; quantidade: Quantidade };

export type ProdutoCascata = {
  id: string;
  componentes: ComponenteRef[];
};

export function calcularCMVsEmCascata(
  insumos: InsumoCascata[],
  produtos: ProdutoCascata[]
): Map<string, Decimal> {
  // Camada 1: preço sem imposto de cada insumo (uma vez).
  const precoSemPorInsumo = new Map<string, Decimal>();
  for (const i of insumos) {
    precoSemPorInsumo.set(i.id, precoSemImposto(i.precoComImposto, i.icms, i.pisCofins));
  }

  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
  const cmvPorProduto = new Map<string, Decimal>();
  const emCalculo = new Set<string>(); // para detectar ciclos

  function cmvDe(produtoId: string): Decimal {
    const memo = cmvPorProduto.get(produtoId);
    if (memo) return memo;
    if (emCalculo.has(produtoId)) {
      throw new ErroCalculoBloqueante(
        `Referência circular na composição envolvendo o produto "${produtoId}".`
      );
    }
    const produto = produtoPorId.get(produtoId);
    if (!produto) {
      throw new ErroCalculoBloqueante(`Produto "${produtoId}" sem ficha técnica.`);
    }

    emCalculo.add(produtoId);
    let cmv = new Decimal(0);
    for (const c of produto.componentes) {
      const quantidade = resolverQuantidade(c.quantidade);
      const custoUnitario =
        c.tipo === "insumo" ? precoSemInsumo(precoSemPorInsumo, c.insumoId) : cmvDe(c.produtoId);
      cmv = cmv.plus(custoUnitario.times(quantidade));
    }
    emCalculo.delete(produtoId);

    cmvPorProduto.set(produtoId, cmv);
    return cmv;
  }

  for (const p of produtos) cmvDe(p.id);
  return cmvPorProduto;
}

function precoSemInsumo(mapa: Map<string, Decimal>, insumoId: string): Decimal {
  const preco = mapa.get(insumoId);
  if (!preco) {
    throw new ErroCalculoBloqueante(`Insumo "${insumoId}" não encontrado ao calcular o CMV.`);
  }
  return preco;
}

// Conveniência: dado um insumo alterado, quais produtos usam ele — direta ou
// indiretamente (via outro produto). Serve para saber o que recalcular/persistir.
export function produtosAfetadosPorInsumo(
  insumoId: string,
  produtos: ProdutoCascata[]
): Set<string> {
  const usaDireto = new Map<string, boolean>();
  for (const p of produtos) {
    usaDireto.set(
      p.id,
      p.componentes.some((c) => c.tipo === "insumo" && c.insumoId === insumoId)
    );
  }

  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
  const afetados = new Set<string>();
  const visitando = new Set<string>();

  function dependeDoInsumo(id: string): boolean {
    if (afetados.has(id)) return true;
    if (usaDireto.get(id)) {
      afetados.add(id);
      return true;
    }
    if (visitando.has(id)) return false; // ciclo: tratado em calcularCMVsEmCascata
    const produto = produtoPorId.get(id);
    if (!produto) return false;
    visitando.add(id);
    let depende = false;
    for (const c of produto.componentes) {
      if (c.tipo === "produto" && dependeDoInsumo(c.produtoId)) depende = true;
    }
    visitando.delete(id);
    if (depende) afetados.add(id);
    return depende;
  }

  for (const p of produtos) dependeDoInsumo(p.id);
  return afetados;
}

// Reexport util para o app: constrói um Decimal a partir de texto (bordas).
export { dec };
