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
export type DifalLinha = { id: string; uf: string; fcp_rate: string | null; base_rate: string | null; final_rate: string; flagged_for_review: boolean; difal_destacado: boolean };
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
    .select("id, uf, fcp_rate, base_rate, final_rate, flagged_for_review, difal_destacado")
    .order("uf");
  if (error) throw error;
  return data as DifalLinha[];
}
export async function atualizarDifal(id: string, final_rate: string): Promise<void> {
  const { error } = await supabase.from("difal_rates").update({ final_rate }).eq("id", id);
  if (error) throw error;
}

// Liga/desliga a cobrança de DIFAL de uma UF sem apagar a alíquota pesquisada.
// Marca se o DIFAL desta UF sai DESTACADO na nota. Não mexe em cálculo nenhum:
// a alíquota é deduzida da margem destacada ou não (Calculations.md §7.2.1).
export async function atualizarDifalDestacado(id: string, difal_destacado: boolean): Promise<void> {
  const { error } = await supabase.from("difal_rates").update({ difal_destacado }).eq("id", id);
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

// ---------- Código de ERP dos produtos (Sprint E) ----------
//
// A reunião de 16/07/2026 pediu código numérico para o sistema de faturamento,
// mas o limite real dele não foi confirmado ("a gente não sabe qual é a
// limitação dele ainda"). Por isso o formato é PARÂMETRO e a geração é manual:
// o código semântico continua sendo a identidade interna, e o de ERP entra em
// paralelo quando a Intertech confirmar o formato.

export type ParametrosCodigoErp = {
  enabled: boolean;
  total_digits: number;
  category_digits: number;
  target_system: string;
};

export async function obterParametrosCodigoErp(): Promise<ParametrosCodigoErp> {
  const { data, error } = await supabase
    .from("erp_code_settings")
    .select("enabled, total_digits, category_digits, target_system")
    .maybeSingle();
  if (error) throw error;
  return (
    (data as ParametrosCodigoErp | null) ?? {
      enabled: false,
      total_digits: 6,
      category_digits: 1,
      target_system: "Simples",
    }
  );
}

export async function salvarParametrosCodigoErp(p: ParametrosCodigoErp): Promise<void> {
  const { error } = await supabase.rpc("save_erp_code_settings", {
    p_enabled: p.enabled,
    p_total_digits: p.total_digits,
    p_category_digits: p.category_digits,
    p_target_system: p.target_system,
  });
  if (error) throw error;
}

// Gera os códigos que ainda faltam. Não mexe em quem já tem código: um código
// que já foi para o ERP não pode mudar.
export async function gerarCodigosErp(): Promise<number> {
  const { data, error } = await supabase.rpc("generate_erp_codes");
  if (error) throw error;
  return Number(data ?? 0);
}

// ---------- Faixas do selo comercial, por canal e por vendedor ----------
//
// Pedido da Intertech em 26/08/2026 (Calculations.md §5.5). Não confundir com
// `margin_rules` acima: aquilo são as faixas de STATUS do painel; estas são as
// que decidem se o pedido segue sozinho ou vai para aprovação.
export type FaixaMargemLinha = {
  id: string;
  channel_id: string | null;
  seller_id: string | null;
  red_max: string;
  yellow_max: string;
  green_max: string;
  channels: { name: string } | null;
  sellers: { name: string } | null;
};

export async function listarFaixasMargemComercial(): Promise<FaixaMargemLinha[]> {
  const { data, error } = await supabase
    .from("commercial_margin_bands")
    .select("id, channel_id, seller_id, red_max, yellow_max, green_max, channels(name), sellers(name)");
  if (error) throw error;
  // Padrão da casa primeiro, depois canal, depois vendedor: é a ordem em que a
  // régua vai ficando mais específica, e a que faz a tela ser lida de cima
  // para baixo sem explicação.
  const linhas: FaixaMargemLinha[] = (data ?? []).map((d) => {
    const bruto = d as unknown as Omit<FaixaMargemLinha, "channels" | "sellers"> & {
      channels: { name: string } | { name: string }[] | null;
      sellers: { name: string } | { name: string }[] | null;
    };
    const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
    return { ...bruto, channels: um(bruto.channels), sellers: um(bruto.sellers) };
  });
  return linhas.sort((a, b) => {
    const peso = (f: FaixaMargemLinha) => (f.seller_id ? 2 : f.channel_id ? 1 : 0);
    if (peso(a) !== peso(b)) return peso(a) - peso(b);
    return (a.channels?.name ?? "").localeCompare(b.channels?.name ?? "");
  });
}

export async function atualizarFaixaMargem(
  id: string,
  campos: Pick<FaixaMargemLinha, "red_max" | "yellow_max" | "green_max">
): Promise<void> {
  const { error } = await supabase.from("commercial_margin_bands").update(campos).eq("id", id);
  if (error) throw error;
}

export async function criarFaixaMargem(campos: {
  channel_id: string | null;
  seller_id: string | null;
  red_max: string;
  yellow_max: string;
  green_max: string;
}): Promise<void> {
  const { error } = await supabase.from("commercial_margin_bands").insert(campos);
  if (error) throw error;
}

export async function removerFaixaMargem(id: string): Promise<void> {
  const { error } = await supabase.from("commercial_margin_bands").delete().eq("id", id);
  if (error) throw error;
}
