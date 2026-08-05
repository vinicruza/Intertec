import { somenteDigitos } from "../../../lib/cadastro/documentos";
import { supabase } from "../supabase";

// ============================================================
// Clientes e sua categorização (reunião Intertech 16/07/2026)
// ============================================================
//
// Categoriza-se o cliente, não o kit: o mesmo kit vai para hospital,
// veterinário e oftalmologia. É daqui que sai a resposta para "das 1.300
// cotações, quantas foram para veterinário?".
//
// Desde 05/08/2026 o cadastro guarda também os dados do formulário de pedido:
// CNPJ, os dois CEPs, contato, telefone e e-mail. Antes disso o cabeçalho da
// ficha impressa saía em branco para alguém preencher à mão.

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
  tax_id: string | null;
  customer_type_id: string | null;
  customer_specialty_id: string | null;
  customer_types: { name: string } | null;
  customer_specialties: { name: string } | null;
};

// Cadastro completo — o que a tela de edição carrega e grava.
export type ClienteCadastro = {
  id: string;
  code: string | null;
  name: string;
  uf: string | null;
  tax_id: string | null;
  billing_zip: string | null;
  shipping_zip: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  customer_type_id: string | null;
  customer_specialty_id: string | null;
};

const CAMPOS_CADASTRO =
  "id, code, name, uf, tax_id, billing_zip, shipping_zip, contact_name, phone, email, notes, customer_type_id, customer_specialty_id";

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
      "id, code, name, uf, tax_id, customer_type_id, customer_specialty_id, customer_types(name), customer_specialties(name)"
    )
    .eq("active", true)
    .order("name")
    .limit(2000);
  if (error) throw error;
  return (data ?? []) as unknown as ClienteLinha[];
}

export async function obterCliente(id: string): Promise<ClienteCadastro | null> {
  const { data, error } = await supabase
    .from("customers")
    .select(CAMPOS_CADASTRO)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ClienteCadastro | null) ?? null;
}

// Grava o cadastro. Documento, CEP e telefone vão SEM MÁSCARA — a pontuação
// é enfeite de tela, e guardá-la faria "11.222.333/0001-81" e
// "11222333000181" virarem dois clientes diferentes. O banco recusa qualquer
// coisa fora desse formato, então a normalização acontece aqui, uma vez só,
// e não espalhada por cada campo do formulário.
export type DadosCliente = {
  name: string;
  uf: string | null;
  tax_id: string | null;
  billing_zip: string | null;
  shipping_zip: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

function limpar(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim();
  return v === "" ? null : v;
}

function digitosOuNulo(valor: string | null | undefined): string | null {
  const d = somenteDigitos(valor);
  return d === "" ? null : d;
}

export async function salvarCliente(id: string | null, d: DadosCliente): Promise<string> {
  const { data, error } = await supabase.rpc("save_customer", {
    p_id: id,
    p_name: d.name.trim(),
    p_uf: limpar(d.uf),
    p_tax_id: digitosOuNulo(d.tax_id),
    p_billing_zip: digitosOuNulo(d.billing_zip),
    p_shipping_zip: digitosOuNulo(d.shipping_zip),
    p_contact_name: limpar(d.contact_name),
    p_phone: digitosOuNulo(d.phone),
    p_email: limpar(d.email),
    p_notes: limpar(d.notes),
  });
  if (error) throw error;
  return data as string;
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
