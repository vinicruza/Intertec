import { Decimal, dec } from "./decimal";
import { ErroCalculoBloqueante, type EntradaDecimal } from "./types";

// ============================================================
// Camada 3 — Despesa alocada (Calculations.md §5)
// ============================================================
//
// Distribui um total de despesa operacional entre os produtos, ponderando
// volume × complexidade. A despesa unitária de UM produto depende do fator
// dele E do mix de produção inteiro (a soma dos pesos):
//
//   peso_produto     = producao_estimada × fator_complexidade
//   participacao     = peso_produto ÷ Σ pesos
//   despesa_alocada  = total_despesa × participacao
//   despesa_unitaria = despesa_alocada ÷ producao_estimada
//
// Golden tests T4 e T5.

export type ParametrosAlocacao = {
  producaoEstimada: EntradaDecimal;
  fatorComplexidade: EntradaDecimal;
  totalDespesa: EntradaDecimal;
  somaPesos: EntradaDecimal; // Σ (producao × fator) de todos os produtos do período
};

export type ResultadoAlocacao = {
  peso: Decimal;
  participacao: Decimal;
  despesaAlocada: Decimal;
  despesaUnitaria: Decimal;
};

export function calcularAlocacao(p: ParametrosAlocacao): ResultadoAlocacao {
  const producao = dec(p.producaoEstimada);
  const somaPesos = dec(p.somaPesos);

  // Guardas: divisões por zero aqui seriam custo unitário sem sentido.
  if (producao.lte(0)) {
    throw new ErroCalculoBloqueante(
      "Alocação bloqueada: produção estimada deve ser maior que zero para ratear despesa por unidade."
    );
  }
  if (somaPesos.lte(0)) {
    throw new ErroCalculoBloqueante(
      "Alocação bloqueada: a soma dos pesos do período é zero (nenhum produto com produção × fator)."
    );
  }

  const peso = producao.times(dec(p.fatorComplexidade));
  const participacao = peso.div(somaPesos);
  const despesaAlocada = dec(p.totalDespesa).times(participacao);
  const despesaUnitaria = despesaAlocada.div(producao);

  return { peso, participacao, despesaAlocada, despesaUnitaria };
}

// Soma dos pesos do período — usada tanto para o denominador acima quanto para
// exibir a memória de cálculo na tela de Alocação (PRD §6.4).
export function somaDosPesos(
  produtos: Array<{ producaoEstimada: EntradaDecimal; fatorComplexidade: EntradaDecimal }>
): Decimal {
  return produtos.reduce(
    (soma, p) => soma.plus(dec(p.producaoEstimada).times(dec(p.fatorComplexidade))),
    new Decimal(0)
  );
}
