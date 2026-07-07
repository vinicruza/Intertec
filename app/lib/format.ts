import { dec, toMoney, toPercent } from "@calc";

// Formatação para exibição (pt-BR). O valor interno permanece em precisão
// total; aqui só arredondamos para mostrar (Calculations.md §9.9).

export function reais(valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  return "R$ " + toMoney(dec(valor)).replace(".", ",");
}

// Recebe uma fração (0,18) e mostra "18,00%".
export function percentual(fracao: string | null | undefined): string {
  if (fracao === null || fracao === undefined || fracao === "") return "—";
  return toPercent(dec(fracao)).replace(".", ",") + "%";
}

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}
