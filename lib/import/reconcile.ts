import { Decimal } from "../calculations/decimal";
import { precoSemImposto } from "../calculations/inputs";
import type { AlocacaoImportada, InsumoImportado, ProdutoImportado } from "./types";

// Tolerância da reconciliação: R$ 0,01 (Calculations.md §11).
const TOLERANCIA = new Decimal("0.01");

// Três verdades comparadas por produto:
//   cmvMotor          = Σ preçoSem(insumo) × qtd  — modelo uniforme deste sistema
//   cmvPlanilhaCusto  = Σ coluna "Custo" do bloco — o que a planilha de fato calcula
//   cmvAlocacao       = coluna "Input" da Alocação — o que as abas de vendedor buscam
//
// Status:
//   ok                    → motor = alocação (tudo reconcilia)
//   modelo_divergente     → planilha (Custo) = alocação, mas o modelo uniforme não
//                           reproduz (ficha usa fórmula especial; ex.: 3M Flexform).
//                           NÃO é erro da planilha — é modelagem a fazer na importação.
//   lookup_divergente     → a coluna Custo do bloco ≠ Alocação Input (o SUMIF por
//                           nome somou/zerou errado — Calculations.md §9.3).
//   sem_alocacao          → produto do Input sem linha na Alocação (nome não bate).
export type StatusReconc = "ok" | "modelo_divergente" | "lookup_divergente" | "sem_alocacao";

export type LinhaReconciliacao = {
  nome: string;
  cmvMotor: Decimal;
  cmvPlanilhaCusto: Decimal;
  cmvAlocacao: Decimal | null;
  difMotorAlocacao: Decimal | null;
  difCustoAlocacao: Decimal | null;
  status: StatusReconc;
};

export type Duplicado = { nome: string; ocorrencias: number };

export type DivergenciaLayer1 = {
  nome: string;
  motor: Decimal;
  planilha: Decimal;
  diferenca: Decimal;
};

export type ResultadoReconciliacao = {
  linhas: LinhaReconciliacao[];
  modeloDivergente: LinhaReconciliacao[]; // planilha ok, modelo uniforme não reproduz
  lookupDivergente: LinhaReconciliacao[]; // coluna Custo ≠ Alocação (bug de lookup)
  semAlocacao: string[];
  semInput: string[];
  recuperaveisPorGrafia: Array<{ input: string; alocacao: string }>;
  duplicadosInput: Duplicado[];
  duplicadosAlocacao: Duplicado[];
  divergenciasLayer1: DivergenciaLayer1[];
  alocacao: {
    totalProdutos: number;
    somaPesosReal: Decimal;
    somaParticipacoes: Decimal;
    somaDespesaAlocada: Decimal;
  };
  totais: {
    insumos: number;
    produtosInput: number;
    ok: number;
    modeloDivergente: number;
    lookupDivergente: number;
    semAlocacao: number;
  };
};

// Normaliza a grafia para detectar nomes "iguais" que só diferem em espaços/caixa
// (ex.: "Campo SImples  1,00" com espaço duplo e I maiúsculo). Calculations.md §9.4.
function normalizar(nome: string): string {
  return nome.trim().replace(/\s+/g, " ").toLowerCase();
}

function contarDuplicados(nomes: string[]): Duplicado[] {
  const contagem = new Map<string, number>();
  for (const n of nomes) contagem.set(n, (contagem.get(n) ?? 0) + 1);
  return [...contagem.entries()]
    .filter(([, k]) => k > 1)
    .map(([nome, ocorrencias]) => ({ nome, ocorrencias }));
}

export function reconciliar(
  insumos: InsumoImportado[],
  produtos: ProdutoImportado[],
  alocacao: AlocacaoImportada[]
): ResultadoReconciliacao {
  // Preço sem imposto de cada insumo, recalculado pelo motor (reconcilia a Camada 1).
  const precoSemPorLinha = new Map<number, Decimal>();
  const divergenciasLayer1: DivergenciaLayer1[] = [];
  for (const ins of insumos) {
    const motor = precoSemImposto(ins.precoComImposto, ins.icms, ins.pisCofins);
    precoSemPorLinha.set(ins.linha, motor);
    if (ins.precoSemImpostoPlanilha && motor.minus(ins.precoSemImpostoPlanilha).abs().gt(TOLERANCIA)) {
      divergenciasLayer1.push({ nome: ins.nome, motor, planilha: ins.precoSemImpostoPlanilha, diferenca: motor.minus(ins.precoSemImpostoPlanilha) });
    }
  }

  // CMV da Alocação por nome exato (a chave que as abas de vendedor usam via SUMIF).
  const cmvAlocacaoPorNome = new Map<string, Decimal | null>();
  for (const a of alocacao) if (!cmvAlocacaoPorNome.has(a.nome)) cmvAlocacaoPorNome.set(a.nome, a.cmvPlanilha);
  const alocacaoNormalizada = new Map<string, string>();
  for (const a of alocacao) alocacaoNormalizada.set(normalizar(a.nome), a.nome);

  const linhas: LinhaReconciliacao[] = [];
  const semAlocacao: string[] = [];
  const recuperaveisPorGrafia: Array<{ input: string; alocacao: string }> = [];

  for (const prod of produtos) {
    const cmvMotor = prod.consumos.reduce(
      (soma, c) => soma.plus((precoSemPorLinha.get(c.linhaInsumo) ?? new Decimal(0)).times(c.quantidade)),
      new Decimal(0)
    );

    if (!cmvAlocacaoPorNome.has(prod.nome)) {
      linhas.push({ nome: prod.nome, cmvMotor, cmvPlanilhaCusto: prod.cmvPlanilhaCusto, cmvAlocacao: null, difMotorAlocacao: null, difCustoAlocacao: null, status: "sem_alocacao" });
      semAlocacao.push(prod.nome);
      const alvo = alocacaoNormalizada.get(normalizar(prod.nome));
      if (alvo) recuperaveisPorGrafia.push({ input: prod.nome, alocacao: alvo });
      continue;
    }

    const cmvAlocacao = cmvAlocacaoPorNome.get(prod.nome) ?? null;
    const difMotorAlocacao = cmvAlocacao === null ? null : cmvMotor.minus(cmvAlocacao);
    const difCustoAlocacao = cmvAlocacao === null ? null : prod.cmvPlanilhaCusto.minus(cmvAlocacao);

    let status: StatusReconc;
    if (difMotorAlocacao !== null && difMotorAlocacao.abs().lte(TOLERANCIA)) {
      status = "ok";
    } else if (difCustoAlocacao !== null && difCustoAlocacao.abs().lte(TOLERANCIA)) {
      // Planilha (coluna Custo) bate com a Alocação; só o modelo uniforme não reproduz.
      status = "modelo_divergente";
    } else {
      // Nem a coluna Custo bate com a Alocação → problema de lookup (SUMIF/nome).
      status = "lookup_divergente";
    }
    linhas.push({ nome: prod.nome, cmvMotor, cmvPlanilhaCusto: prod.cmvPlanilhaCusto, cmvAlocacao, difMotorAlocacao, difCustoAlocacao, status });
  }

  const nomesInput = new Set(produtos.map((p) => p.nome));
  const semInput = alocacao.map((a) => a.nome).filter((n) => !nomesInput.has(n));

  const zero = new Decimal(0);
  const somaPesosReal = alocacao.reduce((s, a) => (a.producao && a.fator ? s.plus(a.producao.times(a.fator)) : s), zero);
  const somaParticipacoes = alocacao.reduce((s, a) => (a.participacao ? s.plus(a.participacao) : s), zero);
  const somaDespesaAlocada = alocacao.reduce((s, a) => (a.despesaAlocada ? s.plus(a.despesaAlocada) : s), zero);

  const modeloDivergente = linhas.filter((l) => l.status === "modelo_divergente");
  const lookupDivergente = linhas.filter((l) => l.status === "lookup_divergente");

  return {
    linhas,
    modeloDivergente,
    lookupDivergente,
    semAlocacao,
    semInput,
    recuperaveisPorGrafia,
    duplicadosInput: contarDuplicados(produtos.map((p) => p.nome)),
    duplicadosAlocacao: contarDuplicados(alocacao.map((a) => a.nome)),
    divergenciasLayer1,
    alocacao: { totalProdutos: alocacao.length, somaPesosReal, somaParticipacoes, somaDespesaAlocada },
    totais: {
      insumos: insumos.length,
      produtosInput: produtos.length,
      ok: linhas.filter((l) => l.status === "ok").length,
      modeloDivergente: modeloDivergente.length,
      lookupDivergente: lookupDivergente.length,
      semAlocacao: semAlocacao.length,
    },
  };
}
