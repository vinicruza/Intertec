import { supabase } from "../supabase";

const TENANT_FIXO = "00000000-0000-0000-0000-000000000001";

// Camada de dados da alocação de despesa mensal (Decisão D3).
// As fórmulas do rateio ficam no motor (lib/calculations/allocation.ts — T4/T5);
// aqui só entra leitura/gravação. Alterar o mês corrente não altera meses
// fechados: cada período tem suas próprias linhas.

export type PeriodoLinha = {
  id: string;
  period: string; // ISO date (1º dia do mês)
  total_expense: string;
  status: "open" | "closed";
};

export type AlocacaoLinha = {
  id: string;
  product_id: string;
  estimated_production: string;
  complexity_factor: string;
  products: { name: string; code: string } | null;
};

export type HistoricoFator = {
  id: string;
  old_factor: string | null;
  new_factor: string | null;
  changed_at: string;
  expense_allocations: { products: { name: string } | null } | null;
};

export async function listarPeriodos(): Promise<PeriodoLinha[]> {
  const { data, error } = await supabase
    .from("expense_allocation_periods")
    .select("id, period, total_expense, status")
    .order("period", { ascending: false });
  if (error) throw error;
  return data as PeriodoLinha[];
}

// `mes` no formato "YYYY-MM" (input type="month").
export async function criarPeriodo(mes: string, total: string): Promise<string> {
  const { data, error } = await supabase
    .from("expense_allocation_periods")
    .insert({
      tenant_id: TENANT_FIXO,
      period: `${mes}-01`,
      total_expense: total.trim().replace(",", "."),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function obterPeriodo(id: string): Promise<PeriodoLinha | null> {
  const { data, error } = await supabase
    .from("expense_allocation_periods")
    .select("id, period, total_expense, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as PeriodoLinha) ?? null;
}

export async function listarAlocacoes(periodId: string): Promise<AlocacaoLinha[]> {
  const { data, error } = await supabase
    .from("expense_allocations")
    .select("id, product_id, estimated_production, complexity_factor, products(name, code)")
    .eq("period_id", periodId);
  if (error) throw error;
  const linhas = (data ?? []) as unknown as AlocacaoLinha[];
  return linhas.sort((a, b) => (a.products?.name ?? "").localeCompare(b.products?.name ?? ""));
}

export async function incluirProdutoNoPeriodo(
  periodId: string,
  productId: string,
  producao: string,
  fator: string
): Promise<void> {
  const { error } = await supabase.from("expense_allocations").insert({
    tenant_id: TENANT_FIXO,
    period_id: periodId,
    product_id: productId,
    estimated_production: producao.trim().replace(",", "."),
    complexity_factor: fator.trim().replace(",", "."),
  });
  if (error) throw error;
}

// Alterar fator/produção: o trigger do banco grava factor_history + audit_logs.
export async function atualizarAlocacao(
  id: string,
  producao: string,
  fator: string
): Promise<void> {
  const { error } = await supabase
    .from("expense_allocations")
    .update({
      estimated_production: producao.trim().replace(",", "."),
      complexity_factor: fator.trim().replace(",", "."),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function removerAlocacao(id: string): Promise<void> {
  const { error } = await supabase.from("expense_allocations").delete().eq("id", id);
  if (error) throw error;
}

export async function encerrarPeriodo(id: string, fechar: boolean): Promise<void> {
  const { error } = await supabase
    .from("expense_allocation_periods")
    .update({ status: fechar ? "closed" : "open" })
    .eq("id", id);
  if (error) throw error;
}

// Histórico de alterações de fator do período (PRD §6.4).
export async function historicoFatores(periodId: string): Promise<HistoricoFator[]> {
  const { data, error } = await supabase
    .from("factor_history")
    .select("id, old_factor, new_factor, changed_at, expense_allocations!inner(period_id, products(name))")
    .eq("expense_allocations.period_id", periodId)
    .order("changed_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as HistoricoFator[];
}
