import { assinaturaKitCompleta, type ItemEmbalagem, type ItemKit } from "@calc";
import { supabase } from "../supabase";

export type KitLinha = {
  id: string;
  code: string | null;
  legacy_code: string | null;
  name: string;
  description: string | null;
  signature: string;
  status: "active" | "inactive";
  kit_items: Array<{
    product_id: string;
    quantity: string;
    products: { name: string } | null;
  }>;
  // Envelope e caixas de esterilização: consumidos UMA vez por kit
  // (reunião Intertech 16/07/2026).
  kit_packaging: Array<{
    input_id: string;
    quantity: string;
    inputs: { name: string; price_without_tax: string | null; is_labor: boolean } | null;
  }>;
};

type RelacaoInsumo = { name: string; price_without_tax: string | null; is_labor: boolean };

type KitLinhaBruta = Omit<KitLinha, "kit_items" | "kit_packaging"> & {
  kit_items?: Array<{
    product_id: string;
    quantity: string;
    products?: { name: string } | { name: string }[] | null;
  }> | null;
  kit_packaging?: Array<{
    input_id: string;
    quantity: string;
    inputs?: RelacaoInsumo | RelacaoInsumo[] | null;
  }> | null;
};

// O PostgREST devolve a relação como objeto ou array de um item, dependendo da
// cardinalidade inferida. Normaliza para objeto ou null.
function primeiro<T>(rel: T | T[] | null | undefined): T | null {
  return Array.isArray(rel) ? rel[0] ?? null : rel ?? null;
}

function normalizarKit(kit: KitLinhaBruta): KitLinha {
  return {
    ...kit,
    kit_items: (kit.kit_items ?? []).map((item) => ({
      product_id: item.product_id,
      quantity: String(item.quantity),
      products: primeiro(item.products),
    })),
    kit_packaging: (kit.kit_packaging ?? []).map((emb) => ({
      input_id: emb.input_id,
      quantity: String(emb.quantity),
      inputs: primeiro(emb.inputs),
    })),
  };
}

const SELECT_KIT =
  "id, code, legacy_code, name, description, signature, status, " +
  "kit_items(product_id, quantity, products(name)), " +
  "kit_packaging(input_id, quantity, inputs(name, price_without_tax, is_labor))";

export async function listarKits(): Promise<KitLinha[]> {
  const { data, error } = await supabase.from("kits").select(SELECT_KIT).order("name");
  if (error) throw error;
  return ((data ?? []) as unknown as KitLinhaBruta[]).map(normalizarKit);
}

export async function obterKit(id: string): Promise<KitLinha | null> {
  const { data, error } = await supabase.from("kits").select(SELECT_KIT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? normalizarKit(data as unknown as KitLinhaBruta) : null;
}

export type KitForm = {
  code?: string;
  name: string;
  description: string;
  itens: ItemKit[];
  embalagem?: ItemEmbalagem[];
};

export type ResultadoSalvarKit =
  | { tipo: "criado"; id: string }
  | { tipo: "atualizado"; id: string }
  // Dedupe (PRD §6.5): já existe kit com a mesma composição — oferecer reutilizar.
  | { tipo: "duplicado"; kitExistente: { id: string; name: string } };

export async function salvarKit(id: string | null, form: KitForm): Promise<ResultadoSalvarKit> {
  const embalagem = form.embalagem ?? [];
  // A embalagem entra na assinatura: mesmos produtos com número diferente de
  // caixas são kits diferentes, porque têm CMV diferente.
  const signature = assinaturaKitCompleta(form.itens, embalagem);
  const { data, error } = await supabase.rpc("save_kit_with_items", {
    p_kit_id: id,
    p_code: form.code?.trim() || null,
    p_name: form.name.trim(),
    p_description: form.description.trim() || null,
    p_signature: signature,
    p_items: form.itens.map((i) => ({ product_id: i.produtoId, quantity: String(i.quantidade) })),
    p_packaging: embalagem.map((e) => ({ input_id: e.insumoId, quantity: String(e.quantidade) })),
  });
  if (error) throw error;
  return data as ResultadoSalvarKit;
}
