import { supabase } from "../supabase";

// ============================================================
// Listas de referência editáveis
// ============================================================
//
// Tipo de cliente, área de atuação e motivo de perda nasceram como partida
// sugerida — a Intertech ainda não fechou nenhuma delas. Sem tela, ajustar
// exigiria mexer no banco à mão.

export type ItemSegmento = {
  id: string;
  name: string;
  code_prefix: string;
  sort_order: number;
  active: boolean;
};

export type TabelaSegmento = "tipo" | "area";

const TABELA: Record<TabelaSegmento, string> = {
  tipo: "customer_types",
  area: "customer_specialties",
};

export async function listarSegmentos(tabela: TabelaSegmento): Promise<ItemSegmento[]> {
  const { data, error } = await supabase
    .from(TABELA[tabela])
    .select("id, name, code_prefix, sort_order, active")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as ItemSegmento[];
}

export async function salvarSegmento(
  tabela: TabelaSegmento,
  item: { id: string | null; name: string; code_prefix: string; sort_order: number; active: boolean }
): Promise<void> {
  const { error } = await supabase.rpc("save_customer_segment", {
    p_tabela: tabela,
    p_id: item.id,
    p_name: item.name,
    p_code_prefix: item.code_prefix,
    p_sort_order: item.sort_order,
    p_active: item.active,
  });
  if (error) throw error;
}

export async function excluirSegmento(tabela: TabelaSegmento, id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_customer_segment", { p_tabela: tabela, p_id: id });
  if (error) throw error;
}

export type MotivoPerdaCadastro = {
  id: string;
  label: string;
  sort_order: number;
  active: boolean;
};

export async function listarMotivosCadastro(): Promise<MotivoPerdaCadastro[]> {
  const { data, error } = await supabase
    .from("loss_reasons")
    .select("id, label, sort_order, active")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as MotivoPerdaCadastro[];
}

export async function salvarMotivo(item: {
  id: string | null;
  label: string;
  sort_order: number;
  active: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc("save_loss_reason", {
    p_id: item.id,
    p_label: item.label,
    p_sort_order: item.sort_order,
    p_active: item.active,
  });
  if (error) throw error;
}

export async function excluirMotivo(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_loss_reason", { p_id: id });
  if (error) throw error;
}

export type CategoriaProduto = {
  id: string;
  name: string;
  prefix: string;
  erp_prefix: string | null;
};

export async function listarCategoriasProduto(): Promise<CategoriaProduto[]> {
  const { data, error } = await supabase
    .from("product_categories")
    .select("id, name, prefix, erp_prefix")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as CategoriaProduto[];
}

export async function salvarPrefixoErp(id: string, prefixo: string): Promise<void> {
  const { error } = await supabase.rpc("save_category_erp_prefix", {
    p_id: id,
    p_erp_prefix: prefixo.trim() || null,
  });
  if (error) throw error;
}
