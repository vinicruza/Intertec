import {
  Decimal,
  calcularAlocacao,
  calcularCMVsEmCascata,
  dec,
  precoSemImposto,
  somaDosPesos,
} from "@calc";
import { supabase } from "../supabase";
import { carregarBaseCascata } from "./produtos";
import { descreverQuantidade, explicarQuantidade, type QuantidadeArmazenada } from "../sim/ficha";

// ============================================================
// Memória de cálculo de um produto — as 4 camadas, ponta a ponta
// ============================================================
//
// Responde "de onde vem este número?" percorrendo a mesma cadeia do
// Calculations.md §1:
//
//   Camada 1  INSUMOS     preço de compra → preço sem imposto
//   Camada 2  FICHA       consumo × preço → CMV unitário
//   Camada 3  ALOCAÇÃO    despesa ÷ (fator × produção) → despesa unitária
//   Camada 4  PEDIDO      receita − deduções → margem  (fica no simulador)
//
// Nada é recalculado e gravado: é leitura. Os números saem do motor puro, os
// mesmos que o sistema usa de verdade — esta tela não tem matemática própria.

export type LinhaCamada1 = {
  insumoId: string;
  nome: string;
  precoCompra: string | null;
  unidadeCompra: string | null;
  fatorConversao: string | null;
  unidadeConsumo: string | null;
  precoComImposto: Decimal;
  icms: Decimal;
  pisCofins: Decimal;
  precoSemImposto: Decimal;
};

export type LinhaCamada2 = {
  tipo: "insumo" | "produto";
  nome: string;
  expressao: string; // "1 × 1,2 ÷ 0,99"
  explicacao: string; // "largura × comprimento ÷ rendimento"
  quantidade: Decimal;
  custoUnitario: Decimal;
  custo: Decimal;
  participacao: Decimal;
};

export type Camada3 = {
  periodoMes: string;
  totalDespesa: Decimal;
  producaoEstimada: Decimal;
  fatorComplexidade: Decimal;
  peso: Decimal;
  somaPesos: Decimal;
  participacao: Decimal;
  despesaAlocada: Decimal;
  despesaUnitaria: Decimal;
};

export type MemoriaProduto = {
  produto: { id: string; nome: string; codigo: string | null };
  camada1: LinhaCamada1[];
  camada2: { linhas: LinhaCamada2[]; cmv: Decimal };
  camada3: Camada3 | null; // null quando não há período de alocação aberto
  custoTotal: Decimal | null; // CMV + despesa unitária
};

export async function memoriaDoProduto(produtoId: string): Promise<MemoriaProduto | null> {
  const [{ data: produto, error: e1 }, { data: componentes, error: e2 }] = await Promise.all([
    supabase.from("products").select("id, name, code").eq("id", produtoId).maybeSingle(),
    supabase
      .from("product_components")
      .select(
        "component_input_id, component_product_id, quantity_type, quantity, width, length, yield_rate, lot_size, computed_quantity, inputs(name, purchase_price, purchase_unit, conversion_factor, consumption_unit, price_with_tax, icms_rate, pis_cofins_rate), products!product_components_component_product_id_fkey(name)"
      )
      .eq("product_id", produtoId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (!produto) return null;

  // CMVs de todos os produtos pelo motor (resolve componentes que são produtos).
  const base = await carregarBaseCascata(null);
  const cmvs = calcularCMVsEmCascata(base.insumos, base.produtos);
  const cmv = cmvs.get(produtoId) ?? new Decimal(0);

  // ---- Camada 1: os insumos deste produto ----
  const camada1: LinhaCamada1[] = [];
  const vistos = new Set<string>();
  for (const c of componentes ?? []) {
    const insumoId = c.component_input_id as string | null;
    if (!insumoId || vistos.has(insumoId)) continue;
    vistos.add(insumoId);
    const i = c.inputs as unknown as {
      name: string; purchase_price: string | null; purchase_unit: string | null;
      conversion_factor: string | null; consumption_unit: string | null;
      price_with_tax: string | null; icms_rate: string; pis_cofins_rate: string;
    } | null;
    if (!i) continue;
    const precoComImposto = dec(i.price_with_tax ?? "0");
    const icms = dec(i.icms_rate ?? "0");
    const pis = dec(i.pis_cofins_rate ?? "0");
    camada1.push({
      insumoId,
      nome: i.name,
      precoCompra: i.purchase_price,
      unidadeCompra: i.purchase_unit,
      fatorConversao: i.conversion_factor,
      unidadeConsumo: i.consumption_unit,
      precoComImposto,
      icms,
      pisCofins: pis,
      precoSemImposto: precoSemImposto(precoComImposto, icms, pis),
    });
  }
  camada1.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  // ---- Camada 2: a ficha ----
  const precoPorInsumo = new Map(camada1.map((l) => [l.insumoId, l.precoSemImposto]));

  // Se há componente-insumo mas nenhum preço veio, o RLS filtrou a tabela
  // `inputs` (perfil sem acesso a custo de insumo). Melhor falhar alto do que
  // desenhar a memória de cálculo com zeros — zero silencioso é a classe de
  // erro nº 3 e 4 da planilha, que o sistema existe para extinguir.
  const temInsumo = (componentes ?? []).some((c) => c.component_input_id);
  if (temInsumo && camada1.length === 0) {
    throw new Error(
      "Sem acesso aos preços dos insumos deste produto — a memória de cálculo não pode ser montada " +
        "sem eles. Peça a um Administrador ou ao Financeiro."
    );
  }

  const linhas: LinhaCamada2[] = (componentes ?? []).map((c) => {
    const armazenada = c as unknown as QuantidadeArmazenada;
    const quantidade = dec((c.computed_quantity as string) ?? "0");
    const ehInsumo = Boolean(c.component_input_id);
    const custoUnitario = ehInsumo
      ? precoPorInsumo.get(c.component_input_id as string) ?? new Decimal(0)
      : cmvs.get(c.component_product_id as string) ?? new Decimal(0);
    const custo = custoUnitario.times(quantidade);
    const nomeInsumo = (c.inputs as unknown as { name: string } | null)?.name;
    const nomeProduto = (c.products as unknown as { name: string } | null)?.name;
    return {
      tipo: ehInsumo ? ("insumo" as const) : ("produto" as const),
      nome: nomeInsumo ?? nomeProduto ?? "—",
      expressao: descreverQuantidade(armazenada),
      explicacao: explicarQuantidade(armazenada),
      quantidade,
      custoUnitario,
      custo,
      participacao: cmv.isZero() ? new Decimal(0) : custo.div(cmv),
    };
  });
  linhas.sort((a, b) => b.custo.comparedTo(a.custo));

  // ---- Camada 3: o rateio da despesa no período aberto ----
  const camada3 = await montarCamada3(produtoId);

  return {
    produto: {
      id: produto.id as string,
      nome: produto.name as string,
      codigo: (produto.code as string | null) ?? null,
    },
    camada1,
    camada2: { linhas, cmv },
    camada3,
    custoTotal: camada3 ? cmv.plus(camada3.despesaUnitaria) : null,
  };
}

async function montarCamada3(produtoId: string): Promise<Camada3 | null> {
  const { data: periodos, error } = await supabase
    .from("expense_allocation_periods")
    .select("id, period, total_expense")
    .eq("status", "open")
    .order("period", { ascending: false })
    .limit(1);
  if (error) throw error;
  const periodo = periodos?.[0];
  if (!periodo) return null;

  const { data: alocs, error: e2 } = await supabase
    .from("expense_allocations")
    .select("product_id, estimated_production, complexity_factor")
    .eq("period_id", periodo.id as string);
  if (e2) throw e2;

  const linhas = alocs ?? [];
  const doProduto = linhas.find((a) => a.product_id === produtoId);
  if (!doProduto) return null; // produto fora do período de alocação

  const somaPesos = somaDosPesos(
    linhas.map((a) => ({
      producaoEstimada: (a.estimated_production as string) ?? "0",
      fatorComplexidade: (a.complexity_factor as string) ?? "0",
    }))
  );
  const producaoEstimada = dec((doProduto.estimated_production as string) ?? "0");
  const fatorComplexidade = dec((doProduto.complexity_factor as string) ?? "0");
  const totalDespesa = dec((periodo.total_expense as string) ?? "0");

  // O motor faz a conta — a tela não recalcula nada por conta própria.
  const r = calcularAlocacao({ producaoEstimada, fatorComplexidade, totalDespesa, somaPesos });

  return {
    periodoMes: periodo.period as string,
    totalDespesa,
    producaoEstimada,
    fatorComplexidade,
    peso: r.peso,
    somaPesos,
    participacao: r.participacao,
    despesaAlocada: r.despesaAlocada,
    despesaUnitaria: r.despesaUnitaria,
  };
}
