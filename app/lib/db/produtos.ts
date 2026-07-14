import { Decimal, resolverQuantidade, type InsumoCascata, type ProdutoCascata, type Quantidade } from "@calc";
import { supabase } from "../supabase";

const TENANT_FIXO = "00000000-0000-0000-0000-000000000001";

export type ProdutoLinha = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  type: string | null;
  sterile: boolean | null;
  size: string | null;
  grammage: string | null;
  status: "active" | "inactive";
  cmv: string | null; // de product_costs (pode não existir ainda)
};

export type TipoQuantidade = "direct" | "area" | "lot";

// Um componente da ficha como o formulário coleta.
export type ComponenteForm = {
  tipo: "insumo" | "produto";
  refId: string; // id do insumo ou produto-componente
  quantity_type: TipoQuantidade;
  quantity: string; // direta
  width: string; // area
  length: string; // area
  yield_rate: string; // area
  lot_size: string; // lote
};

export type ProdutoForm = {
  code?: string;
  name: string;
  category: string;
  type: string;
  sterile: boolean;
  size: string;
  grammage: string;
  componentes: ComponenteForm[];
};

function num(texto: string): string {
  const limpo = (texto ?? "").trim().replace(",", ".");
  return limpo === "" ? "0" : limpo;
}

// Constrói a expressão estruturada de quantidade e resolve o número (motor).
export function quantidadeDoComponente(c: ComponenteForm): { estrutura: Quantidade; valor: Decimal } {
  let estrutura: Quantidade;
  if (c.quantity_type === "area") {
    estrutura = { tipo: "area", largura: num(c.width), comprimento: num(c.length), rendimento: num(c.yield_rate || "1") };
  } else if (c.quantity_type === "lot") {
    estrutura = { tipo: "lote", tamanhoLote: num(c.lot_size) };
  } else {
    estrutura = { tipo: "direta", quantidade: num(c.quantity) };
  }
  return { estrutura, valor: resolverQuantidade(estrutura) };
}

// Carrega a base para o cálculo em cascata (insumos + fichas dos produtos),
// opcionalmente excluindo um produto (o que está sendo editado, cuja ficha vem
// do formulário). Usa a quantidade já computada como "direta".
export async function carregarBaseCascata(
  excluirProdutoId: string | null
): Promise<{ insumos: InsumoCascata[]; produtos: ProdutoCascata[] }> {
  const [{ data: inputs, error: e1 }, { data: comps, error: e2 }] = await Promise.all([
    supabase.from("inputs").select("id, price_with_tax, icms_rate, pis_cofins_rate"),
    supabase.from("product_components").select("product_id, component_input_id, component_product_id, computed_quantity"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const insumos: InsumoCascata[] = (inputs ?? []).map((i) => ({
    id: i.id as string,
    precoComImposto: (i.price_with_tax as string | null) ?? "0",
    icms: (i.icms_rate as string | null) ?? "0",
    pisCofins: (i.pis_cofins_rate as string | null) ?? "0",
  }));

  const porProduto = new Map<string, ProdutoCascata["componentes"]>();
  for (const c of comps ?? []) {
    const pid = c.product_id as string;
    if (pid === excluirProdutoId) continue;
    const lista = porProduto.get(pid) ?? [];
    const quantidade = { tipo: "direta" as const, quantidade: (c.computed_quantity as string) ?? "0" };
    if (c.component_input_id) lista.push({ tipo: "insumo", insumoId: c.component_input_id as string, quantidade });
    else if (c.component_product_id) lista.push({ tipo: "produto", produtoId: c.component_product_id as string, quantidade });
    porProduto.set(pid, lista);
  }
  const produtos: ProdutoCascata[] = [...porProduto.entries()].map(([id, componentes]) => ({ id, componentes }));
  return { insumos, produtos };
}

export async function listarProdutos(): Promise<ProdutoLinha[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, code, name, category, type, sterile, size, grammage, status, product_costs(cmv)")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((p) => {
    const custos = p.product_costs as { cmv: string }[] | { cmv: string } | null;
    const cmv = Array.isArray(custos) ? custos[0]?.cmv ?? null : (custos?.cmv ?? null);
    return { ...p, cmv } as ProdutoLinha;
  });
}

export type ProdutoCompleto = {
  produto: Omit<ProdutoLinha, "cmv">;
  componentes: Array<{
    id: string;
    component_input_id: string | null;
    component_product_id: string | null;
    quantity_type: TipoQuantidade;
    quantity: string | null;
    width: string | null;
    length: string | null;
    yield_rate: string | null;
    lot_size: string | null;
    computed_quantity: string;
  }>;
};

export async function obterProduto(id: string): Promise<ProdutoCompleto | null> {
  const { data: produto, error } = await supabase
    .from("products")
    .select("id, code, name, category, type, sterile, size, grammage, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!produto) return null;
  const { data: componentes, error: e2 } = await supabase
    .from("product_components")
    .select("id, component_input_id, component_product_id, quantity_type, quantity, width, length, yield_rate, lot_size, computed_quantity")
    .eq("product_id", id);
  if (e2) throw e2;
  return { produto, componentes: (componentes ?? []) as ProdutoCompleto["componentes"] };
}

function componentesParaBanco(produtoId: string, form: ProdutoForm) {
  return form.componentes.map((c) => {
    const { valor } = quantidadeDoComponente(c);
    return {
      tenant_id: TENANT_FIXO,
      product_id: produtoId,
      component_input_id: c.tipo === "insumo" ? c.refId : null,
      component_product_id: c.tipo === "produto" ? c.refId : null,
      quantity_type: c.quantity_type,
      quantity: c.quantity_type === "direct" ? num(c.quantity) : null,
      width: c.quantity_type === "area" ? num(c.width) : null,
      length: c.quantity_type === "area" ? num(c.length) : null,
      yield_rate: c.quantity_type === "area" ? num(c.yield_rate || "1") : null,
      lot_size: c.quantity_type === "lot" ? num(c.lot_size) : null,
      computed_quantity: valor.toString(),
    };
  });
}

// Cria/atualiza produto + ficha. A validação de referência circular é do banco
// (trigger) e do motor; aqui o erro do banco sobe para a tela.
export async function salvarProduto(id: string | null, form: ProdutoForm): Promise<string> {
  const campos = {
    tenant_id: TENANT_FIXO,
    code: form.code?.trim() ?? "",
    name: form.name.trim(),
    category: form.category.trim() || null,
    type: form.type.trim() || null,
    sterile: form.sterile,
    size: form.size.trim() || null,
    grammage: form.grammage.trim() || null,
  };

  let produtoId = id;
  if (produtoId) {
    const { error } = await supabase.from("products").update(campos).eq("id", produtoId);
    if (error) throw error;
    const { error: eDel } = await supabase.from("product_components").delete().eq("product_id", produtoId);
    if (eDel) throw eDel;
  } else {
    const { data, error } = await supabase.from("products").insert(campos).select("id").single();
    if (error) throw error;
    produtoId = data.id as string;
  }

  const linhas = componentesParaBanco(produtoId, form);
  if (linhas.length > 0) {
    const { error } = await supabase.from("product_components").insert(linhas);
    if (error) throw error; // inclui a exceção do trigger anti-ciclo
  }
  return produtoId;
}
