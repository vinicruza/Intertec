import { supabase } from "../supabase";

// Camada de dados de Configurações (PRD §6.11). Só Admin escreve (RLS já
// garante isso no banco); Financeiro só lê. Nenhuma regra de cálculo aqui —
// só leitura/gravação das tabelas de parâmetros.

export type CanalLinha = {
  id: string;
  name: string;
  applies_difal: boolean;
  default_commission_rate: string;
  freight_model: "manual" | "uf_percent";
};

export async function listarCanais(): Promise<CanalLinha[]> {
  const { data, error } = await supabase
    .from("channels")
    .select("id, name, applies_difal, default_commission_rate, freight_model")
    .order("name");
  if (error) throw error;
  return data as CanalLinha[];
}

export async function atualizarCanal(
  id: string,
  campos: Pick<CanalLinha, "applies_difal" | "default_commission_rate" | "freight_model">
): Promise<void> {
  const { error } = await supabase.from("channels").update(campos).eq("id", id);
  if (error) throw error;
}

export type RegraMargemLinha = {
  id: string;
  label: string;
  min_rate: string | null;
  max_rate: string | null;
  color: string | null;
  sort_order: number;
};

export async function listarRegrasMargem(): Promise<RegraMargemLinha[]> {
  const { data, error } = await supabase
    .from("margin_rules")
    .select("id, label, min_rate, max_rate, color, sort_order")
    .order("sort_order");
  if (error) throw error;
  return data as RegraMargemLinha[];
}

export async function atualizarRegraMargem(
  id: string,
  campos: Pick<RegraMargemLinha, "min_rate" | "max_rate" | "color">
): Promise<void> {
  const { error } = await supabase.from("margin_rules").update(campos).eq("id", id);
  if (error) throw error;
}

export type IcsmLinha = { id: string; uf: string; icms_rate: string; pis_cofins_rate: string };
export type DifalLinha = { id: string; uf: string; fcp_rate: string | null; base_rate: string | null; final_rate: string; flagged_for_review: boolean };
export type PortalLinha = { id: string; uf: string; freight_percent: string };

export async function listarIcsm(): Promise<IcsmLinha[]> {
  const { data, error } = await supabase.from("icsm_rates").select("id, uf, icms_rate, pis_cofins_rate").order("uf");
  if (error) throw error;
  return data as IcsmLinha[];
}
export async function atualizarIcsm(id: string, icms_rate: string, pis_cofins_rate: string): Promise<void> {
  const { error } = await supabase.from("icsm_rates").update({ icms_rate, pis_cofins_rate }).eq("id", id);
  if (error) throw error;
}

export async function listarDifal(): Promise<DifalLinha[]> {
  const { data, error } = await supabase
    .from("difal_rates")
    .select("id, uf, fcp_rate, base_rate, final_rate, flagged_for_review")
    .order("uf");
  if (error) throw error;
  return data as DifalLinha[];
}
export async function atualizarDifal(id: string, final_rate: string): Promise<void> {
  const { error } = await supabase.from("difal_rates").update({ final_rate }).eq("id", id);
  if (error) throw error;
}

export async function listarPortal(): Promise<PortalLinha[]> {
  const { data, error } = await supabase.from("portal_freight_rates").select("id, uf, freight_percent").order("uf");
  if (error) throw error;
  return data as PortalLinha[];
}
export async function atualizarPortal(id: string, freight_percent: string): Promise<void> {
  const { error } = await supabase.from("portal_freight_rates").update({ freight_percent }).eq("id", id);
  if (error) throw error;
}
