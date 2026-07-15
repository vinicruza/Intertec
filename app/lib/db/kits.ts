import { assinaturaKit, type ItemKit } from "@calc";
import { supabase } from "../supabase";

export type KitLinha = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  signature: string;
  status: "active" | "inactive";
  kit_items: Array<{
    product_id: string;
    quantity: string;
    products: { name: string } | null;
  }>;
};

type KitLinhaBruta = Omit<KitLinha, "kit_items"> & {
  kit_items?: Array<{
    product_id: string;
    quantity: string;
    products?: { name: string } | { name: string }[] | null;
  }> | null;
};

function normalizarKit(kit: KitLinhaBruta): KitLinha {
  return {
    ...kit,
    kit_items: (kit.kit_items ?? []).map((item) => {
      const produto = Array.isArray(item.products) ? item.products[0] ?? null : item.products ?? null;
      return {
        product_id: item.product_id,
        quantity: String(item.quantity),
        products: produto,
      };
    }),
  };
}

export async function listarKits(): Promise<KitLinha[]> {
  const { data, error } = await supabase
    .from("kits")
    .select("id, code, name, description, signature, status, kit_items(product_id, quantity, products(name))")
    .order("name");
  if (error) throw error;
  return ((data ?? []) as unknown as KitLinhaBruta[]).map(normalizarKit);
}

export async function obterKit(id: string): Promise<KitLinha | null> {
  const { data, error } = await supabase
    .from("kits")
    .select("id, code, name, description, signature, status, kit_items(product_id, quantity, products(name))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizarKit(data as unknown as KitLinhaBruta) : null;
}

export type KitForm = {
  code?: string;
  name: string;
  description: string;
  itens: ItemKit[];
};

export type ResultadoSalvarKit =
  | { tipo: "criado"; id: string }
  | { tipo: "atualizado"; id: string }
  // Dedupe (PRD §6.5): já existe kit com a mesma composição — oferecer reutilizar.
  | { tipo: "duplicado"; kitExistente: { id: string; name: string } };

export async function salvarKit(id: string | null, form: KitForm): Promise<ResultadoSalvarKit> {
  const signature = assinaturaKit(form.itens);
  const { data, error } = await supabase.rpc("save_kit_with_items", {
    p_kit_id: id,
    p_code: form.code?.trim() || null,
    p_name: form.name.trim(),
    p_description: form.description.trim() || null,
    p_signature: signature,
    p_items: form.itens.map((i) => ({ product_id: i.produtoId, quantity: String(i.quantidade) })),
  });
  if (error) throw error;
  return data as ResultadoSalvarKit;
}
