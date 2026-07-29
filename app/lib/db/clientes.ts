import { supabase } from "../supabase";

// ============================================================
// Clientes e sua categorização (reunião Intertech 16/07/2026)
// ============================================================
//
// Categoriza-se o cliente, não o kit: o mesmo kit vai para hospital,
// veterinário e oftalmologia. É daqui que sai a resposta para "das 1.300
// cotações, quantas foram para veterinário?".

export type OpcaoSegmento = {
  id: string;
  name: string;
  code_prefix: string;
  sort_order: number;
};

export type ClienteLinha = {
  id: string;
  code: string | null;
  name: string;
  uf: string | null;
  customer_type_id: string | null;
  customer_specialty_id: string | null;
  customer_types: { name: string } | null;
  customer_specialties: { name: string } | null;
};

export async function listarTiposCliente(): Promise<OpcaoSegmento[]> {
  const { data, error } = await supabase
    .from("customer_types")
    .select("id, name, code_prefix, sort_order")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as OpcaoSegmento[];
}

export async function listarAreasCliente(): Promise<OpcaoSegmento[]> {
  const { data, error } = await supabase
    .from("customer_specialties")
    .select("id, name, code_prefix, sort_order")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as OpcaoSegmento[];
}

export async function listarClientes(): Promise<ClienteLinha[]> {
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, code, name, uf, customer_type_id, customer_specialty_id, customer_types(name), customer_specialties(name)"
    )
    .eq("active", true)
    .order("name")
    .limit(2000);
  if (error) throw error;
  return (data ?? []) as unknown as ClienteLinha[];
}

// O código do cliente é gerado pelo banco quando tipo E área estão definidos.
export async function categorizarCliente(
  id: string,
  tipoId: string | null,
  areaId: string | null
): Promise<void> {
  const { error } = await supabase
    .from("customers")
    .update({ customer_type_id: tipoId, customer_specialty_id: areaId })
    .eq("id", id);
  if (error) throw error;
}

export type PendenciaSegmentacao = { total: number; com_pedido: number };

// Quantos cadastros ainda faltam categorizar. A reunião registrou 13 mil sem
// categoria; o trabalho é grande e vale priorizar quem já comprou.
export async function contarClientesSemCategoria(): Promise<PendenciaSegmentacao> {
  const { data, error } = await supabase.rpc("customers_pending_segmentation");
  if (error) throw error;
  const linha = Array.isArray(data) ? data[0] : data;
  return {
    total: Number(linha?.total ?? 0),
    com_pedido: Number(linha?.com_pedido ?? 0),
  };
}
