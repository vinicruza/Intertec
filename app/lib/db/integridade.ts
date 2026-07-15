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
