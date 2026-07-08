import { Decimal } from "../calculations/decimal";
import type {
  AlocacaoImportada,
  InsumoImportado,
  Planilha,
  ProdutoImportado,
} from "./types";

// Mapa das colunas/linhas da planilha (engenharia reversa — Calculations.md §2, §3, §5).
// Deixamos como constantes nomeadas para que qualquer mudança de layout seja um
// ponto único de ajuste, não uma caça a números mágicos espalhados.
const ABA_INPUT = "Input Preço";
const ABA_ALOCACAO = "Alocação Despesa";

const INSUMO_PRIMEIRA_LINHA = 4;
const COL_INSUMO_NOME = 2;
const COL_INSUMO_ICMS = 4;
const COL_INSUMO_PIS = 5;
const COL_INSUMO_PRECO_COM = 6;
const COL_INSUMO_PRECO_SEM = 7;

const PRODUTO_PRIMEIRA_COLUNA = 8; // bloco H; cada produto ocupa 3 colunas (Qtd, Custo, %)
const PRODUTO_PASSO = 3;
const PRODUTO_LINHA_NOME = 2;
const PRODUTO_OFFSET_CUSTO = 1; // 2ª coluna do bloco = "Custo"

const ALOC_PRIMEIRA_LINHA = 2;
const ALOC_COL_ITEM = 2;
const ALOC_COL_INPUT = 3;
const ALOC_COL_PRODUCAO = 4;
const ALOC_COL_FATOR = 5;
const ALOC_COL_PARTICIPACAO = 7;
const ALOC_COL_DESP_ALOCADA = 8;

function paraDecimal(v: string | number | null): Decimal | null {
  if (typeof v === "number") return new Decimal(v.toString());
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return new Decimal(v.trim());
  }
  return null;
}

function texto(v: string | number | null): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// A Alocação tem uma linha de resumo "TOTAL" (produção e fator já somados) que
// NÃO é um produto — incluí-la infla os totais. Filtramos linhas de resumo.
function ehLinhaResumo(nome: string): boolean {
  return ["TOTAL", "TOTAIS"].includes(nome.trim().toUpperCase());
}

// Insumos: linhas a partir da 4, com nome (col B) e preço com imposto (col F) numérico.
export function extrairInsumos(p: Planilha): InsumoImportado[] {
  const { linhas } = p.dimensoes(ABA_INPUT);
  const insumos: InsumoImportado[] = [];
  for (let linha = INSUMO_PRIMEIRA_LINHA; linha <= linhas; linha++) {
    const nome = texto(p.valor(ABA_INPUT, linha, COL_INSUMO_NOME));
    const precoCom = paraDecimal(p.valor(ABA_INPUT, linha, COL_INSUMO_PRECO_COM));
    if (!nome || precoCom === null) continue;
    insumos.push({
      linha,
      nome,
      icms: paraDecimal(p.valor(ABA_INPUT, linha, COL_INSUMO_ICMS)) ?? new Decimal(0),
      pisCofins: paraDecimal(p.valor(ABA_INPUT, linha, COL_INSUMO_PIS)) ?? new Decimal(0),
      precoComImposto: precoCom,
      precoSemImpostoPlanilha: paraDecimal(p.valor(ABA_INPUT, linha, COL_INSUMO_PRECO_SEM)),
    });
  }
  return insumos;
}

// Produtos: blocos de 3 colunas a partir da H, com nome na linha 2.
// A quantidade consumida de cada insumo está na 1ª coluna do bloco, na linha do insumo.
export function extrairProdutos(p: Planilha, insumos: InsumoImportado[]): ProdutoImportado[] {
  const { colunas } = p.dimensoes(ABA_INPUT);
  const produtos: ProdutoImportado[] = [];
  for (let coluna = PRODUTO_PRIMEIRA_COLUNA; coluna <= colunas; coluna += PRODUTO_PASSO) {
    const nome = texto(p.valor(ABA_INPUT, PRODUTO_LINHA_NOME, coluna));
    if (!nome) continue;
    const consumos = insumos
      .map((ins) => ({
        linhaInsumo: ins.linha,
        quantidade: paraDecimal(p.valor(ABA_INPUT, ins.linha, coluna)),
        custoPlanilha: paraDecimal(p.valor(ABA_INPUT, ins.linha, coluna + PRODUTO_OFFSET_CUSTO)),
      }))
      .filter(
        (c): c is { linhaInsumo: number; quantidade: Decimal; custoPlanilha: Decimal | null } =>
          c.quantidade !== null && !c.quantidade.isZero()
      );
    // CMV que a planilha realmente calcula: soma da coluna "Custo" do bloco.
    let cmvPlanilhaCusto = new Decimal(0);
    for (const ins of insumos) {
      const custo = paraDecimal(p.valor(ABA_INPUT, ins.linha, coluna + PRODUTO_OFFSET_CUSTO));
      if (custo !== null) cmvPlanilhaCusto = cmvPlanilhaCusto.plus(custo);
    }
    produtos.push({ coluna, nome, consumos, cmvPlanilhaCusto });
  }
  return produtos;
}

// Alocação: uma linha por produto, a partir da 2.
export function extrairAlocacao(p: Planilha): AlocacaoImportada[] {
  const { linhas } = p.dimensoes(ABA_ALOCACAO);
  const registros: AlocacaoImportada[] = [];
  for (let linha = ALOC_PRIMEIRA_LINHA; linha <= linhas; linha++) {
    const nome = texto(p.valor(ABA_ALOCACAO, linha, ALOC_COL_ITEM));
    if (!nome || ehLinhaResumo(nome)) continue;
    registros.push({
      nome,
      cmvPlanilha: paraDecimal(p.valor(ABA_ALOCACAO, linha, ALOC_COL_INPUT)),
      producao: paraDecimal(p.valor(ABA_ALOCACAO, linha, ALOC_COL_PRODUCAO)),
      fator: paraDecimal(p.valor(ABA_ALOCACAO, linha, ALOC_COL_FATOR)),
      participacao: paraDecimal(p.valor(ABA_ALOCACAO, linha, ALOC_COL_PARTICIPACAO)),
      despesaAlocada: paraDecimal(p.valor(ABA_ALOCACAO, linha, ALOC_COL_DESP_ALOCADA)),
    });
  }
  return registros;
}
