import Decimal from "decimal.js";

// Núcleo de precisão do motor de cálculo (docs/02-Arquitetura.md §4).
//
// Por que não usamos o número comum do JavaScript (float)?
// Porque float erra centavos: 0,1 + 0,2 dá 0,30000000000000004. Em dinheiro,
// isso é inaceitável. Toda a matemática financeira do sistema passa por Decimal.
//
// Precisão de 40 dígitos significativos: folga suficiente para cadeias longas
// de multiplicação e divisão (ex.: rateio com denominador 14.445.616) sem
// perder centavos. NUNCA arredondamos durante o cálculo — só na exibição
// (Calculations.md §9.9). O arredondamento aqui configurado só entra em ação
// quando um resultado excede 40 dígitos, o que não ocorre nos nossos valores.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

// Apelido para deixar claro, na leitura do código, o que é valor monetário.
export type Money = Decimal;

// Constrói um Decimal a partir de texto (preferido) ou de outro Decimal.
// Regra do projeto: dinheiro nunca trafega como float. Nas bordas do sistema,
// o `numeric` do Postgres chega como texto — e é assim que deve entrar aqui.
export function dec(value: Decimal | string): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

// Arredonda para 2 casas — SÓ para exibição na tela ou para gravar os totais
// de um pedido fechado. O valor interno permanece em precisão total.
export function toMoney(value: Decimal): string {
  return value.toFixed(2, Decimal.ROUND_HALF_UP);
}

// Formata uma fração (0,3982) como percentual com 2 casas ("39.82") — exibição.
export function toPercent(fraction: Decimal): string {
  return fraction.times(100).toFixed(2, Decimal.ROUND_HALF_UP);
}
