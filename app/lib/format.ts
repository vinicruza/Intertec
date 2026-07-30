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

// "há 3 dias" / "hoje" / "há 1 hora" — só para dar a sensação de urgência na
// fila de aprovação; não é cálculo financeiro, é rótulo de tempo decorrido.
export function haQuanto(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return "agora há pouco";
  if (horas < 24) return `há ${horas} hora${horas === 1 ? "" : "s"}`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} dia${dias === 1 ? "" : "s"}`;
}
