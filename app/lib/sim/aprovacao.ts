import type { Perfil } from "../roles";

// ============================================================
// Regras de aprovação e visibilidade da margem — módulo puro
// (reunião Intertech 16/07/2026 + decisão do cliente em 29/07/2026)
// ============================================================
//
// Sem dependência de banco ou de tela, para poder ser testado isoladamente.

export type ParametrosAprovacao = {
  // Quem pode aprovar. PERFIS, não pessoas: a reunião não fechou se é a Cris
  // ou a Michelle, e isso é decisão operacional que muda com o tempo.
  approver_roles: Perfil[];
  require_approval: boolean;
  // Nulo = sem trava por margem. É o padrão, por decisão da reunião: primeiro
  // dar visibilidade e observar o comportamento, só depois decidir se trava.
  block_below_margin: string | null;
  hide_margin_numbers_from_sales: boolean;
};

export const PARAMETROS_APROVACAO_PADRAO: ParametrosAprovacao = {
  approver_roles: ["admin", "financeiro"],
  require_approval: true,
  block_below_margin: null,
  hide_margin_numbers_from_sales: true,
};

export function podeVerNumerosDeMargem(
  perfil: Perfil | null | undefined,
  params: ParametrosAprovacao | undefined
): boolean {
  if (!perfil) return false;
  if (!params?.hide_margin_numbers_from_sales) return true;
  return perfil !== "comercial";
}

export function podeVerCascataOperacional(perfil: Perfil | null | undefined): boolean {
  return perfil === "admin" || perfil === "financeiro" || perfil === "comercial";
}

export const podeVerCascataNoSimulador = podeVerCascataOperacional;

export function podeAprovar(
  perfil: Perfil | null | undefined,
  params: ParametrosAprovacao | undefined
): boolean {
  if (!perfil || !params) return false;
  return params.approver_roles.includes(perfil);
}
