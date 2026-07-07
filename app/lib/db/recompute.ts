import { calcularCMVsEmCascata, type ComponenteRef, type InsumoCascata, type ProdutoCascata } from "@calc";
import { supabase } from "../supabase";

const TENANT_FIXO = "00000000-0000-0000-0000-000000000001";

// Recalcula o CMV vigente de todos os produtos e grava em product_costs.
// Deve ser chamado após alterar o preço de um insumo (recálculo em cascata,
// PRD §6.1). Pedidos FECHADOS não são afetados — eles têm snapshot próprio (D7).
//
// Observação: na Sprint 6 ainda não há produtos cadastrados (isso é a Sprint 7),
// então isto é o encanamento pronto — roda sem efeito enquanto não houver fichas.
export async function recalcularCMVsVigentes(): Promise<number> {
  const [{ data: inputs, error: e1 }, { data: comps, error: e2 }] = await Promise.all([
    supabase.from("inputs").select("id, price_with_tax, icms_rate, pis_cofins_rate"),
    supabase
      .from("product_components")
      .select("product_id, component_input_id, component_product_id, computed_quantity"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const insumos: InsumoCascata[] = (inputs ?? []).map((i) => ({
    id: i.id as string,
    precoComImposto: (i.price_with_tax as string | null) ?? "0",
    icms: (i.icms_rate as string | null) ?? "0",
    pisCofins: (i.pis_cofins_rate as string | null) ?? "0",
  }));

  // Agrupa componentes por produto. Usamos a quantidade já computada na ficha
  // como quantidade "direta" — o que muda no recálculo por preço são os custos.
  const porProduto = new Map<string, ComponenteRef[]>();
  for (const c of comps ?? []) {
    const lista = porProduto.get(c.product_id as string) ?? [];
    const quantidade = { tipo: "direta" as const, quantidade: (c.computed_quantity as string) ?? "0" };
    if (c.component_input_id) {
      lista.push({ tipo: "insumo", insumoId: c.component_input_id as string, quantidade });
    } else if (c.component_product_id) {
      lista.push({ tipo: "produto", produtoId: c.component_product_id as string, quantidade });
    }
    porProduto.set(c.product_id as string, lista);
  }

  const produtos: ProdutoCascata[] = [...porProduto.entries()].map(([id, componentes]) => ({ id, componentes }));
  if (produtos.length === 0) return 0;

  const cmvs = calcularCMVsEmCascata(insumos, produtos);
  const linhas = [...cmvs.entries()].map(([product_id, cmv]) => ({
    product_id,
    tenant_id: TENANT_FIXO,
    cmv: cmv.toString(),
    calculated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("product_costs").upsert(linhas, { onConflict: "product_id" });
  if (error) throw error;
  return linhas.length;
}
