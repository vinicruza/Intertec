import { Decimal, dec, precoSemImposto } from "@calc";
import { supabase } from "../supabase";

const TENANT_FIXO = "00000000-0000-0000-0000-000000000001"; // multi-tenant preparado (PRD §8)

// Linha da tabela `inputs` como vem do banco (numeric chega como texto — nunca float).
export type InsumoLinha = {
  id: string;
  name: string;
  category: string | null;
  status: "active" | "inactive";
  purchase_unit: string | null;
  purchase_price: string | null;
  conversion_factor: string;
  consumption_unit: string | null;
  price_with_tax: string | null;
  icms_rate: string;
  pis_cofins_rate: string;
  price_without_tax: string | null;
  price_updated_at: string | null;
  updated_at: string | null;
};

// Dados que o formulário coleta (o preço com/sem imposto é derivado, não digitado).
export type InsumoFormulario = {
  name: string;
  category: string;
  purchase_unit: string;
  purchase_price: string; // texto do formulário
  conversion_factor: string;
  consumption_unit: string;
  icms_rate: string; // fração (0,18)
  pis_cofins_rate: string;
};

// Converte texto do formulário (aceita vírgula) em Decimal.
function paraDecimal(texto: string): Decimal {
  const limpo = texto.trim().replace(",", ".");
  return dec(limpo === "" ? "0" : limpo);
}

// Regra de negócio (Calculations.md §2): preço com imposto = preço de compra ×
// fator de conversão; preço sem imposto = motor. Fica no lib, não na tela.
export function derivarPrecos(form: InsumoFormulario): { comImposto: Decimal; semImposto: Decimal } {
  const comImposto = paraDecimal(form.purchase_price).times(paraDecimal(form.conversion_factor || "1"));
  const semImposto = precoSemImposto(comImposto, paraDecimal(form.icms_rate), paraDecimal(form.pis_cofins_rate));
  return { comImposto, semImposto };
}

export async function listarInsumos(): Promise<InsumoLinha[]> {
  const { data, error } = await supabase
    .from("inputs")
    .select("*")
    .order("name");
  if (error) throw error;
  return data as InsumoLinha[];
}

export async function obterInsumo(id: string): Promise<InsumoLinha | null> {
  const { data, error } = await supabase.from("inputs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as InsumoLinha) ?? null;
}

function paraRegistro(form: InsumoFormulario) {
  const { comImposto, semImposto } = derivarPrecos(form);
  return {
    tenant_id: TENANT_FIXO,
    name: form.name.trim(),
    category: form.category.trim() || null,
    purchase_unit: form.purchase_unit.trim() || null,
    purchase_price: paraDecimal(form.purchase_price).toString(),
    conversion_factor: paraDecimal(form.conversion_factor || "1").toString(),
    consumption_unit: form.consumption_unit.trim() || null,
    icms_rate: paraDecimal(form.icms_rate).toString(),
    pis_cofins_rate: paraDecimal(form.pis_cofins_rate).toString(),
    price_with_tax: comImposto.toString(),
    price_without_tax: semImposto.toString(),
  };
}

export async function criarInsumo(form: InsumoFormulario): Promise<string> {
  const { data, error } = await supabase
    .from("inputs")
    .insert({ ...paraRegistro(form), price_updated_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function atualizarInsumo(id: string, form: InsumoFormulario): Promise<void> {
  // O trigger do banco registra a mudança de preço em input_cost_history.
  const { error } = await supabase.from("inputs").update(paraRegistro(form)).eq("id", id);
  if (error) throw error;
}

export type HistoricoCusto = {
  id: string;
  old_price_with_tax: string | null;
  new_price_with_tax: string | null;
  old_price_without_tax: string | null;
  new_price_without_tax: string | null;
  changed_at: string;
};

export async function listarHistorico(insumoId: string): Promise<HistoricoCusto[]> {
  const { data, error } = await supabase
    .from("input_cost_history")
    .select("id, old_price_with_tax, new_price_with_tax, old_price_without_tax, new_price_without_tax, changed_at")
    .eq("input_id", insumoId)
    .order("changed_at", { ascending: false });
  if (error) throw error;
  return data as HistoricoCusto[];
}
