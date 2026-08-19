import { Decimal } from "../calculations/decimal";
import type { Planilha } from "./types";
import { extrairAlocacao, extrairInsumos } from "./extract";

// ============================================================
// Conferência da BASE DE DADOS — banco × planilha
// ------------------------------------------------------------
// A conferência de pedidos (conferencia.ts) responde "o motor calcula igual
// à planilha?". Esta responde a outra pergunta, que é independente:
// "o banco tem os MESMOS NÚMEROS que a planilha?".
//
// As duas precisam estar verdes ao mesmo tempo. Motor certo sobre base velha
// produz orçamento errado com a mesma confiança de motor errado — e sem
// nenhum sintoma na tela.
//
// Puro: recebe a planilha pela interface `Planilha` e o retrato do banco como
// listas. Quem lê o arquivo e quem consulta o banco ficam fora daqui.
// ============================================================

export type InsumoBanco = {
  nome: string;
  precoComImposto: Decimal;
  precoSemImposto: Decimal;
};

export type ProdutoBanco = {
  nome: string;
  cmv: Decimal | null; // null = produto sem custo calculado
};

export type RetratoBanco = {
  insumos: InsumoBanco[];
  produtos: ProdutoBanco[];
};

export const TOLERANCIA_CMV = new Decimal("0.01");
export const TOLERANCIA_PRECO = new Decimal("0.0001");

// Casa nomes ignorando acento, caixa e espaço repetido — a planilha escreve
// "Bobina SMS 40gr m²" e o banco "Bobina SMS 40 gr m²"; são o mesmo insumo, e
// tratá-los como dois esconderia justamente o que queremos medir.
export function chaveDeNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type DivergenciaValor = {
  nome: string;
  planilha: Decimal;
  banco: Decimal;
  diferenca: Decimal; // planilha − banco
};

export type ComparacaoLista = {
  soNaPlanilha: string[];
  soNoBanco: string[];
  emAmbos: number;
  iguais: number;
  divergentes: DivergenciaValor[];
  duplicadosPlanilha: string[];
  duplicadosBanco: string[];
};

export type ConferenciaBase = {
  insumos: ComparacaoLista;
  produtos: ComparacaoLista;
  // Produtos que a planilha tem e o banco não: são os que o vendedor NÃO vai
  // achar na tela. É o achado mais urgente de todos, por isso sai destacado.
  produtosAusentesNoSistema: string[];
  semCustoNoBanco: string[];
};

type Entrada = { nome: string; valor: Decimal | null };

function indexar(itens: Entrada[]): { mapa: Map<string, Entrada>; duplicados: string[] } {
  const mapa = new Map<string, Entrada>();
  const duplicados: string[] = [];
  for (const item of itens) {
    const chave = chaveDeNome(item.nome);
    if (mapa.has(chave)) duplicados.push(item.nome);
    mapa.set(chave, item);
  }
  return { mapa, duplicados };
}

function comparar(
  daPlanilha: Entrada[],
  doBanco: Entrada[],
  tolerancia: Decimal
): ComparacaoLista {
  const p = indexar(daPlanilha);
  const b = indexar(doBanco);

  const soNaPlanilha: string[] = [];
  const divergentes: DivergenciaValor[] = [];
  let emAmbos = 0;
  let iguais = 0;

  for (const [chave, item] of p.mapa) {
    const noBanco = b.mapa.get(chave);
    if (!noBanco) {
      soNaPlanilha.push(item.nome);
      continue;
    }
    emAmbos++;
    if (item.valor === null || noBanco.valor === null) continue;
    const diferenca = item.valor.minus(noBanco.valor);
    if (diferenca.abs().lte(tolerancia)) iguais++;
    else divergentes.push({ nome: item.nome, planilha: item.valor, banco: noBanco.valor, diferenca });
  }

  const soNoBanco: string[] = [];
  for (const [chave, item] of b.mapa) {
    if (!p.mapa.has(chave)) soNoBanco.push(item.nome);
  }

  // Maior diferença primeiro: é por onde se começa a consertar.
  divergentes.sort((x, y) => y.diferenca.abs().comparedTo(x.diferenca.abs()));

  return {
    soNaPlanilha: soNaPlanilha.sort(),
    soNoBanco: soNoBanco.sort(),
    emAmbos,
    iguais,
    divergentes,
    duplicadosPlanilha: p.duplicados.sort(),
    duplicadosBanco: b.duplicados.sort(),
  };
}

export function conferirBase(planilha: Planilha, banco: RetratoBanco): ConferenciaBase {
  // Insumos: comparados pelo preço COM imposto, que é o número digitado. O
  // preço sem imposto é derivado — se a base do cálculo bate, ele bate junto.
  const insumosPlanilha: Entrada[] = extrairInsumos(planilha).map((i) => ({
    nome: i.nome,
    valor: i.precoComImposto,
  }));
  const insumosBanco: Entrada[] = banco.insumos.map((i) => ({
    nome: i.nome,
    valor: i.precoComImposto,
  }));

  // Produtos: comparados pela coluna "Input" da Alocação — é o CMV que as abas
  // de vendedor de fato consultam, e portanto o que aparece no orçamento.
  const produtosPlanilha: Entrada[] = extrairAlocacao(planilha).map((a) => ({
    nome: a.nome,
    valor: a.cmvPlanilha,
  }));
  const produtosBanco: Entrada[] = banco.produtos.map((p) => ({ nome: p.nome, valor: p.cmv }));

  const insumos = comparar(insumosPlanilha, insumosBanco, TOLERANCIA_PRECO);
  const produtos = comparar(produtosPlanilha, produtosBanco, TOLERANCIA_CMV);

  return {
    insumos,
    produtos,
    produtosAusentesNoSistema: produtos.soNaPlanilha,
    semCustoNoBanco: banco.produtos.filter((p) => p.cmv === null || p.cmv.lte(0)).map((p) => p.nome).sort(),
  };
}
