import { Decimal } from "../calculations/decimal";
import type {
  DeducoesImportadas,
  ItemPedidoImportado,
  LinhaTabelaFiscal,
  PedidoImportado,
  Planilha,
  TabelasFiscais,
} from "./types";

// ============================================================
// Extração da Camada 4 — abas de vendedor (Calculations.md §6, §7, §8)
// ------------------------------------------------------------
// Puro: opera sobre a interface `Planilha`, sem conhecer arquivo nem exceljs.
// ============================================================

const ABAS_PEDIDO = [
  "Camila",
  "Isabela",
  "Suellen",
  "Descpro",
  "Priscilene",
  "Patricia",
  "Nathalia",
  "Mari",
  "Externos",
  "Revendas",
  "Temporaria Patricia",
  "Edmilson",
] as const;

const COL_ROTULO_CABECALHO = 3; // C — "Cliente:" / "UF"
const COL_VALOR_CABECALHO = 4; // D — valor ao lado do rótulo
const COL_VENDEDOR = 10; // J
const COL_ITEM_NOME = 3; // C
const COL_ITEM_PRECO = 4; // D
const COL_ITEM_QTD = 5; // E
const COL_ITEM_RECEITA = 6; // F
const COL_ITEM_CMV_UN = 8; // H
const COL_ITEM_DESPESA_UN = 10; // J
const COL_TOTAL_RECEITA = 6; // F — também o rótulo "Total do Pedido"
const COL_TOTAL_CMV = 10; // J
const COL_TOTAL_DESPESA = 11; // K
const COL_DEDUCAO_ROTULO = 13; // M
const COL_DEDUCAO_VALOR = 14; // N

const PRIMEIRA_LINHA_ITEM = 7;
const LIMITE_VARREDURA = 80; // nenhuma aba põe o bloco de pedido abaixo disso

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

// Compara rótulos ignorando acento, caixa e espaço repetido. A planilha escreve
// "Receita Liquida" sem acento, "Comissão" com, e o Externos usa "% Comissão" —
// casar por texto exato quebraria a cada correção de digitação.
export function normalizarRotulo(v: string | number | null): string {
  const s = texto(v);
  if (s === null) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// A flag "Frete Cliente" da planilha é um SUMIF por "X" — que no Excel casa
// maiúscula e minúscula. Fora das abas padrão ela aparece como 0 numérico
// (Patricia, Externos) ou célula vazia: nenhum desses conta como marcada.
function flagMarcada(v: string | number | null): boolean {
  const s = texto(v);
  return s !== null && s.toLowerCase() === "x";
}

// Procura, na coluna C do cabeçalho, o rótulo pedido e devolve o valor da D.
function valorCabecalho(p: Planilha, aba: string, rotulo: string): string | null {
  for (let linha = 1; linha < PRIMEIRA_LINHA_ITEM; linha++) {
    if (normalizarRotulo(p.valor(aba, linha, COL_ROTULO_CABECALHO)).startsWith(rotulo)) {
      return texto(p.valor(aba, linha, COL_VALOR_CABECALHO));
    }
  }
  return null;
}

// A linha de total é a que fica logo abaixo do rótulo "Total do Pedido" (col F).
// Achá-la por rótulo, e não por número fixo, é o que permite ler Patricia
// (total na 24), Nathalia (25), Priscilene (27) e Isabela (41) com um só código.
function acharLinhaTotal(p: Planilha, aba: string): number | null {
  for (let linha = 1; linha <= LIMITE_VARREDURA; linha++) {
    if (normalizarRotulo(p.valor(aba, linha, COL_TOTAL_RECEITA)) === "total do pedido") {
      return linha + 1;
    }
  }
  return null;
}

function extrairDeducoes(p: Planilha, aba: string, ateLinha: number): DeducoesImportadas {
  const d: DeducoesImportadas = {
    frete: null,
    impostoFrete: null,
    imposto: null,
    difal: null,
    comissao: null,
    percentualComissao: null,
    aliquotaSimples: null,
    freteCliente: false,
    receitaLiquida: null,
    margemContribuicao: null,
  };

  for (let linha = 1; linha <= ateLinha; linha++) {
    const rotulo = normalizarRotulo(p.valor(aba, linha, COL_DEDUCAO_ROTULO));
    if (rotulo === "") continue;
    const bruto = p.valor(aba, linha, COL_DEDUCAO_VALOR);
    const valor = paraDecimal(bruto);

    // "Imposto Frete" tem de ser testado antes de "Imposto", senão o prefixo
    // comum faria a primeira linha engolir a segunda.
    if (rotulo === "frete do pedido") d.frete = valor;
    else if (rotulo === "imposto frete") d.impostoFrete = valor;
    else if (rotulo === "imposto") d.imposto = valor;
    else if (rotulo === "difal") d.difal = valor;
    else if (rotulo === "% comissao") d.percentualComissao = valor;
    else if (rotulo === "comissao") d.comissao = valor;
    else if (rotulo === "aliquota simples") d.aliquotaSimples = valor;
    else if (rotulo === "frete cliente") d.freteCliente = flagMarcada(bruto);
    else if (rotulo === "receita liquida") d.receitaLiquida = valor;
    else if (rotulo === "margem de contribuicao") d.margemContribuicao = valor;
  }

  return d;
}

// Lê o pedido vivo de uma aba de vendedor. Cada aba comporta um pedido só
// (Calculations.md §9.7) — é exatamente a limitação que o sistema resolve.
export function extrairPedido(p: Planilha, aba: string): PedidoImportado | null {
  if (!p.abas().includes(aba)) return null;
  const linhaTotal = acharLinhaTotal(p, aba);
  if (linhaTotal === null) return null;

  const itens: ItemPedidoImportado[] = [];
  for (let linha = PRIMEIRA_LINHA_ITEM; linha < linhaTotal; linha++) {
    const nome = texto(p.valor(aba, linha, COL_ITEM_NOME));
    if (!nome) continue;
    itens.push({
      linha,
      nome,
      precoVenda: paraDecimal(p.valor(aba, linha, COL_ITEM_PRECO)),
      quantidade: paraDecimal(p.valor(aba, linha, COL_ITEM_QTD)),
      receitaPlanilha: paraDecimal(p.valor(aba, linha, COL_ITEM_RECEITA)),
      cmvUnitario: paraDecimal(p.valor(aba, linha, COL_ITEM_CMV_UN)),
      despesaUnitaria: paraDecimal(p.valor(aba, linha, COL_ITEM_DESPESA_UN)),
    });
  }

  return {
    aba,
    cliente: valorCabecalho(p, aba, "cliente"),
    uf: valorCabecalho(p, aba, "uf"),
    vendedor: texto(p.valor(aba, 2, COL_VENDEDOR)),
    linhaTotal,
    itens,
    receitaPlanilha: paraDecimal(p.valor(aba, linhaTotal, COL_TOTAL_RECEITA)),
    cmvPlanilha: paraDecimal(p.valor(aba, linhaTotal, COL_TOTAL_CMV)),
    despesaPlanilha: paraDecimal(p.valor(aba, linhaTotal, COL_TOTAL_DESPESA)),
    deducoes: extrairDeducoes(p, aba, LIMITE_VARREDURA),
  };
}

export function extrairPedidos(p: Planilha): PedidoImportado[] {
  const pedidos: PedidoImportado[] = [];
  for (const aba of ABAS_PEDIDO) {
    const pedido = extrairPedido(p, aba);
    if (pedido) pedidos.push(pedido);
  }
  return pedidos;
}

// ------------------------------------------------------------
// Tabelas de parâmetro (Calculations.md §7)
// ------------------------------------------------------------

function extrairTabela(
  p: Planilha,
  aba: string,
  quantasColunas: number,
  ultimaLinha: number
): LinhaTabelaFiscal[] {
  if (!p.abas().includes(aba)) return [];
  const linhas: LinhaTabelaFiscal[] = [];
  for (let linha = 2; linha <= ultimaLinha; linha++) {
    const uf = texto(p.valor(aba, linha, 1));
    // Só siglas de UF: qualquer outra coisa é cabeçalho, nota ou lixo abaixo da tabela.
    if (!uf || !/^[A-Za-z]{2}$/.test(uf)) continue;
    const valores: (Decimal | null)[] = [];
    for (let coluna = 2; coluna <= quantasColunas + 1; coluna++) {
      valores.push(paraDecimal(p.valor(aba, linha, coluna)));
    }
    linhas.push({ uf: uf.toUpperCase(), valores });
  }
  return linhas;
}

export function extrairTabelasFiscais(p: Planilha): TabelasFiscais {
  return {
    icsm: extrairTabela(p, "ICSM", 3, 40),
    difal: extrairTabela(p, "DIFAL", 3, 40),
    portal: extrairTabela(p, "Portal", 1, 40),
  };
}

// Alíquota total de imposto sobre venda (ICSM) da UF de destino.
// A planilha grava a UF ora "PR", ora "rj" — o SUMIF do Excel não liga para a
// caixa, e o sistema também não pode ligar, sob pena de zerar o imposto.
export function aliquotaIcsm(tabelas: TabelasFiscais, uf: string | null): Decimal | null {
  if (!uf) return null;
  const linha = tabelas.icsm.find((l) => l.uf === uf.trim().toUpperCase());
  return linha?.valores[2] ?? null;
}

// DIFAL da UF. SP não tem linha (venda interna) — devolve 0, que é o mesmo
// resultado do SUMIF da planilha, mas aqui por decisão explícita, não por acaso.
export function aliquotaDifal(tabelas: TabelasFiscais, uf: string | null): Decimal {
  if (!uf) return new Decimal(0);
  const linha = tabelas.difal.find((l) => l.uf === uf.trim().toUpperCase());
  return linha?.valores[2] ?? new Decimal(0);
}

// Percentual de frete do canal portal/marketplace (abas Mari e Temporaria Patricia).
export function percentualPortal(tabelas: TabelasFiscais, uf: string | null): Decimal | null {
  if (!uf) return null;
  const linha = tabelas.portal.find((l) => l.uf === uf.trim().toUpperCase());
  return linha?.valores[0] ?? null;
}
