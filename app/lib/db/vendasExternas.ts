import { Decimal, consumoOrdenado, explodirConsumo, type ProdutoComposicao } from "@calc";
import { supabase } from "../supabase";
import type { LinhaVenda } from "../sim/importacaoVendas";

// ============================================================
// Vendas vindas do ERP e consumo de insumos
// (reunião Intertech 16/07/2026)
// ============================================================
//
// O faturamento continua no Simples, então o sistema não terá 100% das vendas.
// O acordo foi importar o relatório de vendas por código e cruzar com o CMV
// unitário que o sistema já calcula.

export type ResultadoImportacao = {
  periodo: string;
  total: number;
  conciliados: number;
  pendentes: number;
};

export async function importarVendas(
  periodo: string, // "2026-07"
  linhas: LinhaVenda[],
  substituir = true
): Promise<ResultadoImportacao> {
  const { data, error } = await supabase.rpc("import_external_sales", {
    p_period: `${periodo}-01`,
    p_rows: linhas.map((l) => ({
      codigo: l.codigo,
      descricao: l.descricao,
      quantidade: l.quantidade,
      receita: l.receita,
    })),
    p_replace: substituir,
  });
  if (error) throw error;
  return data as ResultadoImportacao;
}

export type VendaImportada = {
  id: string;
  source_code: string;
  description: string | null;
  quantity: string;
  revenue: string | null;
  product_id: string | null;
  kit_id: string | null;
  products: { name: string; code: string } | null;
  kits: { name: string; code: string } | null;
};

export async function listarVendasImportadas(periodo: string): Promise<VendaImportada[]> {
  const { data, error } = await supabase
    .from("external_sales")
    .select("id, source_code, description, quantity, revenue, product_id, kit_id, products(name, code), kits(name, code)")
    .eq("period", `${periodo}-01`)
    .order("source_code");
  if (error) throw error;
  return (data ?? []) as unknown as VendaImportada[];
}

// ---------- Consumo de insumos no período ----------

export type LinhaConsumo = {
  insumoId: string;
  nome: string;
  unidade: string | null;
  quantidade: string;
};

// Explode as vendas importadas até os insumos, respondendo "quanto vendemos de
// laminado / SMS / TNT azul 30g" — o insumo não tem código de venda próprio,
// está dentro de vários produtos.
export async function calcularConsumoDoPeriodo(periodo: string): Promise<LinhaConsumo[]> {
  const [vendas, componentes, insumos, kitItens] = await Promise.all([
    supabase.from("external_sales").select("quantity, product_id, kit_id").eq("period", `${periodo}-01`),
    supabase.from("product_components").select("product_id, component_input_id, component_product_id, quantity_type, quantity, width, length, yield_rate, lot_size"),
    supabase.from("inputs").select("id, name, consumption_unit"),
    supabase.from("kit_items").select("kit_id, product_id, quantity"),
  ]);
  for (const r of [vendas, componentes, insumos, kitItens]) {
    if (r.error) throw r.error;
  }

  type ComponenteBruto = {
    product_id: string;
    component_input_id: string | null;
    component_product_id: string | null;
    quantity_type: "direct" | "area" | "lot";
    quantity: string | null;
    width: string | null;
    length: string | null;
    yield_rate: string | null;
    lot_size: string | null;
  };

  // Fichas técnicas dos produtos.
  const porProduto = new Map<string, ProdutoComposicao>();
  for (const c of (componentes.data ?? []) as ComponenteBruto[]) {
    const atual = porProduto.get(c.product_id) ?? { id: c.product_id, componentes: [] };
    const quantidade =
      c.quantity_type === "area"
        ? { tipo: "area" as const, largura: String(c.width), comprimento: String(c.length), rendimento: String(c.yield_rate) }
        : c.quantity_type === "lot"
          ? { tipo: "lote" as const, tamanhoLote: String(c.lot_size) }
          : { tipo: "direta" as const, quantidade: String(c.quantity) };

    atual.componentes.push(
      c.component_input_id
        ? { tipo: "insumo", insumoId: c.component_input_id, quantidade }
        : { tipo: "produto", produtoId: c.component_product_id as string, quantidade }
    );
    porProduto.set(c.product_id, atual);
  }

  // Kits entram como produtos compostos: o cálculo de explosão é o mesmo.
  for (const ki of (kitItens.data ?? []) as Array<{ kit_id: string; product_id: string; quantity: string }>) {
    const chave = `kit:${ki.kit_id}`;
    const atual = porProduto.get(chave) ?? { id: chave, componentes: [] };
    atual.componentes.push({
      tipo: "produto",
      produtoId: ki.product_id,
      quantidade: { tipo: "direta", quantidade: String(ki.quantity) },
    });
    porProduto.set(chave, atual);
  }

  const composicoes = [...porProduto.values()];
  const vendasParaExplodir = ((vendas.data ?? []) as Array<{ quantity: string; product_id: string | null; kit_id: string | null }>)
    .flatMap((v) => {
      const id = v.product_id ?? (v.kit_id ? `kit:${v.kit_id}` : null);
      // Linha não conciliada não entra no consumo: seria inventar composição.
      if (!id || !porProduto.has(id)) return [];
      return [{ produtoId: id, quantidade: String(v.quantity) }];
    });

  if (vendasParaExplodir.length === 0) return [];

  const consumo = explodirConsumo(vendasParaExplodir, composicoes);
  const nomePorInsumo = new Map(
    ((insumos.data ?? []) as Array<{ id: string; name: string; consumption_unit: string | null }>)
      .map((i) => [i.id, i])
  );

  return consumoOrdenado(consumo).map((c) => {
    const insumo = nomePorInsumo.get(c.insumoId);
    return {
      insumoId: c.insumoId,
      nome: insumo?.name ?? "(insumo removido)",
      unidade: insumo?.consumption_unit ?? null,
      quantidade: (c.quantidade as Decimal).toString(),
    };
  });
}
