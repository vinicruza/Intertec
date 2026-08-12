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
  // Nulo = cadastrado manualmente na tela de Kits. Preenchido = nasceu do
  // fechamento deste pedido (reunião 16/07/2026: o código oficial só nasce
  // quando o pedido é ganho). Rastreabilidade pedida pelo cliente em 30/07/2026.
  source_order_id: string | null;
  kit_items: Array<{
    product_id: string;
    quantity: string;
    products: { name: string } | null;
  }>;
  // Envelope e caixas de esterilização: consumidos UMA vez por kit
  // (reunião Intertech 16/07/2026).
  kit_packaging: Array<{
    input_id: string;
    // 'direct' = N por kit (envelope). 'lot' = 1 ÷ itens por caixa (caixa de
    // esterilização, que atende vários kits).
    quantity_type: "direct" | "lot";
    quantity: string | null;
    lot_size: string | null;
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
    quantity_type: "direct" | "lot";
    quantity: string | null;
    lot_size: string | null;
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
      quantity_type: emb.quantity_type ?? "direct",
      quantity: emb.quantity == null ? null : String(emb.quantity),
      lot_size: emb.lot_size == null ? null : String(emb.lot_size),
      inputs: primeiro(emb.inputs),
    })),
  };
}

const SELECT_KIT =
  "id, code, legacy_code, name, description, signature, status, source_order_id, " +
  "kit_items(product_id, quantity, products(name)), " +
  "kit_packaging(input_id, quantity_type, quantity, lot_size, inputs(name, price_without_tax, is_labor))";

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
  | { tipo: "criado"; id: string; code: string | null }
  | { tipo: "atualizado"; id: string; code: string | null }
  // Dedupe (PRD §6.5): já existe kit com a mesma composição — oferecer
  // reutilizar. O CÓDIGO vem junto: é ele que identifica o kit no pedido, na
  // nota e na fábrica; nome de kit não identifica nada.
  | {
      tipo: "duplicado";
      kitExistente: { id: string; name: string; code: string | null; status: "active" | "inactive" };
    };

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
    p_packaging: embalagem.map((e) => ({
      input_id: e.insumoId,
      quantity_type: e.quantidade.tipo === "lote" ? "lot" : "direct",
      quantity: e.quantidade.tipo === "direta" ? String(e.quantidade.quantidade) : null,
      lot_size: e.quantidade.tipo === "lote" ? String(e.quantidade.tamanhoLote) : null,
    })),
  });
  if (error) throw error;
  return data as ResultadoSalvarKit;
}

// ---------- Rastreabilidade (decisão do cliente, 30/07/2026) ----------
//
// "Quem criou" mora em profiles, e o RLS de profiles só deixa um Administrador
// ler o perfil de OUTRA pessoa. Sem uma função dedicada, Financeiro, Comercial
// e Produção abririam um kit e não veriam quem criou nem de qual pedido ele
// nasceu — metade da rastreabilidade pedida ficaria faltando para 3 dos 4
// perfis. A função no banco devolve só o necessário para esta pergunta.
export type OrigemKit = {
  created_by_name: string | null;
  created_at: string;
  source_order_id: string | null;
  source_order_quote_number: string | null;
  source_order_status: "simulation" | "closed" | "lost" | null;
};

export async function obterOrigemKit(kitId: string): Promise<OrigemKit | null> {
  const { data, error } = await supabase.rpc("get_kit_origin", { p_kit_id: kitId });
  if (error) throw error;
  return ((data as OrigemKit[] | null) ?? [])[0] ?? null;
}

export type PedidoRecenteDoKit = {
  order_id: string;
  quote_number: string | null;
  order_number: string | null;
  status: "simulation" | "closed" | "lost" | string;
  customer_name: string | null;
  quantity: string;
  used_at: string | null;
};

export type AuditoriaKit = {
  kit_id: string;
  created_at: string;
  created_by_name: string | null;
  source_order_id: string | null;
  source_order_quote_number: string | null;
  source_order_number: string | null;
  source_order_customer_name: string | null;
  source_order_status: "simulation" | "closed" | "lost" | string | null;
  used_in_orders_count: number;
  generated_orders_count: number;
  total_quantity: string;
  last_used_at: string | null;
  recent_orders: PedidoRecenteDoKit[];
};

type AuditoriaKitBruta = Omit<
  AuditoriaKit,
  "used_in_orders_count" | "generated_orders_count" | "total_quantity" | "recent_orders"
> & {
  used_in_orders_count: number | string;
  generated_orders_count: number | string;
  total_quantity: number | string;
  recent_orders: unknown;
};

function normalizarAuditoriaKit(linha: AuditoriaKitBruta): AuditoriaKit {
  return {
    ...linha,
    used_in_orders_count: Number(linha.used_in_orders_count ?? 0),
    generated_orders_count: Number(linha.generated_orders_count ?? 0),
    total_quantity: String(linha.total_quantity ?? "0"),
    recent_orders: Array.isArray(linha.recent_orders)
      ? (linha.recent_orders as PedidoRecenteDoKit[]).map((p) => ({
          ...p,
          quantity: String(p.quantity ?? "0"),
        }))
      : [],
  };
}

export async function listarAuditoriaKits(): Promise<AuditoriaKit[]> {
  const { data, error } = await supabase.rpc("get_kits_audit");
  if (error) throw error;
  return ((data ?? []) as unknown as AuditoriaKitBruta[]).map(normalizarAuditoriaKit);
}
