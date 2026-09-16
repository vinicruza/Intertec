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

// ============================================================
// Bobina comprada por quilo (Calculations.md §2.1)
// ============================================================
//
// O fornecedor cobra a bobina em R$/kg, mas a ficha técnica consome m². Quem
// liga as duas unidades é a GRAMATURA: um TNT de 40 g/m² pesa 0,04 kg a cada
// m², então cada m² custa 4% do preço do quilo.
//
//   fator (kg/m²)  = gramatura (g/m²) ÷ 1.000
//   preco_por_m2   = preco_por_kg × fator
//
// O resultado é o preço COM imposto — daí em diante a bobina segue o caminho
// de qualquer outro insumo, por `precoSemImposto`. Golden tests T18 e T18b.
export const GRAMAS_POR_QUILO = "1000";

export function fatorDaGramatura(gramaturaEmGramasPorM2: EntradaDecimal): Decimal {
  return dec(gramaturaEmGramasPorM2).div(GRAMAS_POR_QUILO);
}

export function precoDaBobina(
  precoPorKg: EntradaDecimal,
  gramaturaEmGramasPorM2: EntradaDecimal
): Decimal {
  return dec(precoPorKg).times(fatorDaGramatura(gramaturaEmGramasPorM2));
}
