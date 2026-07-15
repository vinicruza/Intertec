import { dec, toMoney, toPercent } from "@calc";

// Formatação para exibição (pt-BR). O valor interno permanece em precisão
// total; aqui só arredondamos para mostrar (Calculations.md §9.9).

export type ValorNumerico = string | number | null | undefined;

export function reais(valor: ValorNumerico): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  try {
    return "R$ " + toMoney(dec(String(valor))).replace(".", ",");
  } catch {
    return "—";
  }
}

// Recebe uma fração (0,18) e mostra "18,00%".
export function percentual(fracao: ValorNumerico): string {
  if (fracao === null || fracao === undefined || fracao === "") return "—";
  try {
    return toPercent(dec(String(fracao))).replace(".", ",") + "%";
  } catch {
    return "—";
  }
}

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}
