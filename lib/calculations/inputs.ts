import { Decimal, dec } from "./decimal";
import type { EntradaDecimal } from "./types";

// ============================================================
// Camada 1 — Insumos: preço sem imposto (Calculations.md §2)
// ============================================================
//
// A empresa remove os impostos "por fora": multiplica o preço por
// (1 − ICMS − PIS/COFINS). NÃO é o método "por dentro" (dividir por
// 1 + alíquotas). Isso é uma decisão da empresa, não teoria tributária —
// o sistema reproduz exatamente o que a planilha faz (Calculations.md §2).
//
//   preco_sem_imposto = preco_com_imposto × (1 − ICMS − PIS_COFINS)
//
// Golden tests T1 e T2.
export function precoSemImposto(
  precoComImposto: EntradaDecimal,
  icms: EntradaDecimal,
  pisCofins: EntradaDecimal
): Decimal {
  const fatorImposto = new Decimal(1).minus(dec(icms)).minus(dec(pisCofins));
  return dec(precoComImposto).times(fatorImposto);
}
