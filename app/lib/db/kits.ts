import { assinaturaKit, type ItemKit } from "@calc";
import { supabase } from "../supabase";

const TENANT_FIXO = "00000000-0000-0000-0000-000000000001";

export type KitLinha = {
  id: string;
  code: string; // gerado pelo banco (K001, K002...)
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

export async function listarKits(): Promise<KitLinha[]> {
  const { data, error } = await supabase
    .from("kits")
    .select("id, code, name, description, signature, status, kit_items(product_id, quantity, products(name))")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as KitLinha[];
}

export async function obterKit(id: string): Promise<KitLinha | null> {
  const { data, error } = await supabase
    .from("kits")
    .select("id, code, name, description, signature, status, kit_items(product_id, quantity, products(name))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as KitLinha) ?? null;
}

// O código (K001, K002...) é gerado pelo banco (sequência atômica) — o
// usuário nunca digita um.
export type KitForm = {
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

  // Verifica dedupe antes de gravar (a UNIQUE do banco é a garantia final).
  const { data: existente, error: eBusca } = await supabase
    .from("kits")
    .select("id, name")
    .eq("signature", signature)
    .maybeSingle();
  if (eBusca) throw eBusca;
  if (existente && existente.id !== id) {
    return { tipo: "duplicado", kitExistente: existente as { id: string; name: string } };
  }

  const campos = {
    tenant_id: TENANT_FIXO,
    name: form.name.trim(),
    description: form.description.trim() || null,
    signature,
  };

  let kitId = id;
  if (kitId) {
    const { error } = await supabase.from("kits").update(campos).eq("id", kitId);
    if (error) throw error;
    const { error: eDel } = await supabase.from("kit_items").delete().eq("kit_id", kitId);
    if (eDel) throw eDel;
  } else {
    const { data, error } = await supabase.from("kits").insert(campos).select("id").single();
    if (error) throw error;
    kitId = data.id as string;
  }

  const { error: eItens } = await supabase.from("kit_items").insert(
    form.itens.map((i) => ({
      tenant_id: TENANT_FIXO,
      kit_id: kitId,
      product_id: i.produtoId,
      quantity: String(i.quantidade),
    }))
  );
  if (eItens) throw eItens;

  return id ? { tipo: "atualizado", id: kitId } : { tipo: "criado", id: kitId };
}
