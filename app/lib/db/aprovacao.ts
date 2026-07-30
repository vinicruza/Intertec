import { supabase } from "../supabase";
import { PARAMETROS_APROVACAO_PADRAO, type ParametrosAprovacao } from "../sim/aprovacao";

export { podeAprovar, podeVerNumerosDeMargem, type ParametrosAprovacao } from "../sim/aprovacao";

// ============================================================
// Aprovação do pedido (reunião 16/07/2026 + decisão de 29/07/2026)
// ============================================================
//
// Hoje o pedido sai em papel e vai para a mesa de quem confere. O papel não
// mostra margem, então "se o CMV está alto ou baixo, se o markup está bom" não
// dá para saber na hora. Aqui o pedido sobe com os números à vista de quem
// aprova, e quem aprova é definido por PERFIL, não por pessoa.

export async function obterParametrosAprovacao(): Promise<ParametrosAprovacao> {
  const { data, error } = await supabase
    .from("approval_settings")
    .select("approver_roles, require_approval, block_below_margin, hide_margin_numbers_from_sales")
    .maybeSingle();
  if (error) throw error;
  return (data as ParametrosAprovacao | null) ?? PARAMETROS_APROVACAO_PADRAO;
}

export async function salvarParametrosAprovacao(p: ParametrosAprovacao): Promise<void> {
  const { error } = await supabase.rpc("save_approval_settings", {
    p_approver_roles: p.approver_roles,
    p_require_approval: p.require_approval,
    p_block_below_margin: p.block_below_margin,
    p_hide_margin_numbers_from_sales: p.hide_margin_numbers_from_sales,
  });
  if (error) throw error;
}

export async function enviarParaAprovacao(orderId: string): Promise<void> {
  const { error } = await supabase.rpc("submit_order_for_approval", { p_order_id: orderId });
  if (error) throw error;
}

export async function decidirAprovacao(
  orderId: string,
  aprovado: boolean,
  observacao: string
): Promise<void> {
  const { error } = await supabase.rpc("decide_order_approval", {
    p_order_id: orderId,
    p_aprovado: aprovado,
    p_notes: observacao.trim() || null,
  });
  if (error) throw error;
}

// ---------- Fila de aprovação ----------
//
// Tela visível a quem PODE aprovar de verdade (perfis marcados em
// approver_roles), não a um perfil fixo — a permissão real já é configurável
// em Configurações, então a visibilidade da tela segue a mesma regra, em vez
// de duplicar uma lista separada que pode ficar desalinhada.

export type PedidoPendente = {
  id: string;
  quote_number: string | null;
  uf: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  customers: { name: string } | null;
  sellers: { name: string } | null;
  channels: { name: string } | null;
  order_items: Array<{ quantity: string; unit_price: string }>;
};

export async function listarPedidosPendentesDeAprovacao(): Promise<PedidoPendente[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, quote_number, uf, submitted_at, submitted_by, customers(name), sellers(name), channels(name), order_items(quantity, unit_price)"
    )
    .eq("approval_status", "pendente")
    .is("cancelled_at", null)
    .order("submitted_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PedidoPendente[];
}

// Só a contagem, para o selo no menu — mais leve que carregar a lista inteira
// em toda navegação.
export async function contarPedidosPendentesDeAprovacao(): Promise<number> {
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("approval_status", "pendente")
    .is("cancelled_at", null);
  if (error) throw error;
  return count ?? 0;
}
