import { supabase } from "../supabase";

export type ResumoIntegridade = {
  products_without_components: number;
  products_without_valid_cmv: number;
  empty_kits: number;
  kit_items_without_cmv: number;
  orders_without_items: number;
  closed_orders_without_snapshot: number;
  customers_without_uf: number;
  active_products_without_open_allocation: number;
  checked_at: string;
};

export async function carregarResumoIntegridade(): Promise<ResumoIntegridade> {
  const { data, error } = await supabase.rpc("get_data_quality_summary");
  if (error) throw error;
  return data as ResumoIntegridade;
}

export type PendenciaProduto = { id: string; code: string; name: string };
export type DetalhesIntegridade = {
  open_period_id: string | null;
  open_period: string | null;
  products_without_components: PendenciaProduto[];
  products_without_allocation: PendenciaProduto[];
};

export async function carregarDetalhesIntegridade(): Promise<DetalhesIntegridade> {
  const { data, error } = await supabase.rpc("get_data_quality_details");
  if (error) throw error;
  return data as DetalhesIntegridade;
}
