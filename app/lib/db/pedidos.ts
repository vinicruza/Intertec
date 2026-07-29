import { Decimal, custoKitCompleto, type CustoProdutoKit, type EmbalagemKit } from "@calc";
import { supabase } from "../supabase";
import type { CanalRegras, RegraMargem, TabelasUF } from "../sim/params";

// ---------- Contexto do simulador (tudo que a tela precisa) ----------

export type VendedorOpcao = {
  id: string;
  name: string;
  channel_id: string;
  canalNome: string;
  regras: CanalRegras;
};

export type ItemVendavel = {
  tipo: "produto" | "kit";
  id: string;
  nome: string;
  codigo: string;
  cmvUnitario: string | null; // null = sem custo vigente (erro bloqueante ao usar)
  despesaUnitaria: string | null;
};

export type ContextoSimulador = {
  vendedores: VendedorOpcao[];
  clientes: Array<{ id: string; name: string; uf: string | null }>;
  ufs: string[]; // UFs com alíquota ICSM cadastrada
  tabelaPorUF: Map<string, TabelasUF>;
  itens: ItemVendavel[];
  regrasMargem: RegraMargem[];
};

export async function carregarContextoSimulador(): Promise<ContextoSimulador> {
  const [vend, cli, icsm, difal, portal, regras, prods, custos, kits] = await Promise.all([
    supabase.from("sellers").select("id, name, channel_id, channels(name, applies_difal, default_commission_rate, freight_model)").eq("active", true).order("name"),
    supabase.from("customers").select("id, name, uf").eq("active", true).order("name"),
    supabase.from("icsm_rates").select("uf, icms_rate, pis_cofins_rate"),
    supabase.from("difal_rates").select("uf, final_rate"),
    supabase.from("portal_freight_rates").select("uf, freight_percent"),
    supabase.from("margin_rules").select("label, min_rate, max_rate, color, sort_order"),
    supabase.from("products").select("id, code, name").eq("status", "active").order("name"),
    supabase.from("product_costs").select("product_id, cmv, cmv_without_labor"),
    supabase
      .from("kits")
      .select("id, code, name, kit_items(product_id, quantity), kit_packaging(quantity, inputs(name, price_without_tax, is_labor))")
      .eq("status", "active")
      .order("name"),
  ]);
  for (const r of [vend, cli, icsm, difal, portal, regras, prods, custos, kits]) {
    if (r.error) throw r.error;
  }

  const custoPorProduto = new Map<string, CustoProdutoKit>(
    (custos.data ?? []).map((c) => [
      c.product_id as string,
      { cmv: c.cmv as string, cmvSemMaoDeObra: (c.cmv_without_labor as string | null) ?? undefined },
    ])
  );

  const itensProdutos: ItemVendavel[] = (prods.data ?? []).map((p) => ({
    tipo: "produto",
    id: p.id as string,
    nome: p.name as string,
    codigo: p.code as string,
    cmvUnitario: custoPorProduto.get(p.id as string)?.cmv.toString() ?? null,
    // A alocação de despesas saiu do produto (decisão do cliente em 29/07/2026).
    despesaUnitaria: "0",
  }));

  type EmbalagemBruta = {
    quantity: string;
    inputs?:
      | { name: string; price_without_tax: string | null; is_labor: boolean }
      | Array<{ name: string; price_without_tax: string | null; is_labor: boolean }>
      | null;
  };

  // Kit: CMV = soma ponderada dos produtos + embalagem/esterilização do kit
  // (Calculations.md §4 — envelope e caixa são consumidos UMA vez por kit).
  const itensKits: ItemVendavel[] = (kits.data ?? []).map((k) => {
    const composicao = (k.kit_items as Array<{ product_id: string; quantity: string }>).map((i) => ({
      produtoId: i.product_id,
      quantidade: i.quantity,
    }));
    const embalagem: EmbalagemKit[] = ((k.kit_packaging ?? []) as EmbalagemBruta[]).flatMap((e) => {
      const insumo = Array.isArray(e.inputs) ? e.inputs[0] ?? null : e.inputs ?? null;
      if (!insumo?.price_without_tax) return [];
      return [{
        nome: insumo.name,
        custoUnitario: insumo.price_without_tax,
        quantidade: String(e.quantity),
        maoDeObra: insumo.is_labor,
      }];
    });

    let cmv: string | null = null;
    try {
      cmv = custoKitCompleto(composicao, custoPorProduto, embalagem).custoTotal.toString();
    } catch {
      cmv = null;
    }
    return {
      tipo: "kit",
      id: k.id as string,
      codigo: k.code as string,
      nome: `[Kit] ${k.name as string}`,
      cmvUnitario: cmv,
      despesaUnitaria: "0",
    };
  });

  const tabelaPorUF = new Map<string, TabelasUF>();
  const difalPorUF = new Map((difal.data ?? []).map((d) => [d.uf as string, d.final_rate as string]));
  const portalPorUF = new Map((portal.data ?? []).map((p) => [p.uf as string, p.freight_percent as string]));
  for (const r of icsm.data ?? []) {
    const uf = r.uf as string;
    const aliquota = new Decimal(r.icms_rate as string).plus(r.pis_cofins_rate as string).toString();
    tabelaPorUF.set(uf, {
      aliquotaIcsm: aliquota,
      difalFinal: difalPorUF.get(uf) ?? "0",
      fretePortalPct: portalPorUF.get(uf) ?? null,
    });
  }

  return {
    vendedores: (vend.data ?? []).map((v) => {
      const c = v.channels as unknown as { name: string; applies_difal: boolean; default_commission_rate: string; freight_model: "manual" | "uf_percent" } | null;
      return {
        id: v.id as string,
        name: v.name as string,
        channel_id: v.channel_id as string,
        canalNome: c?.name ?? "—",
        regras: {
          aplicaDifal: c?.applies_difal ?? true,
          comissaoPadrao: c?.default_commission_rate ?? "0.025",
          modeloFrete: c?.freight_model ?? "manual",
        },
      };
    }),
    clientes: (cli.data ?? []) as Array<{ id: string; name: string; uf: string | null }>,
    ufs: [...tabelaPorUF.keys()].sort(),
    tabelaPorUF,
    itens: [...itensProdutos, ...itensKits],
    regrasMargem: (regras.data ?? []) as RegraMargem[],
  };
}

// ---------- Gravação da simulação ----------

export type ItemSimulacao = {
  tipo: "produto" | "kit";
  refId: string;
  quantidade: string;
  precoVenda: string;
};

export type DadosSimulacao = {
  clienteId: string | null;
  clienteNovoNome: string | null;
  uf: string;
  vendedorId: string;
  channelId: string;
  frete: string;
  fretePorContaCliente: boolean;
  comissao: string; // fração efetivamente usada
  itens: ItemSimulacao[];
};

// Salva a simulação (status = simulation). Snapshots NÃO são gravados aqui —
// o congelamento acontece só no fechamento do pedido (D7, Sprint 11).
export async function salvarSimulacao(d: DadosSimulacao): Promise<string> {
  const { data, error } = await supabase.rpc("create_order_with_items", {
    p_order: {
      customer_id: d.clienteId,
      customer_name: d.clienteNovoNome?.trim() || null,
      uf: d.uf,
      seller_id: d.vendedorId,
      channel_id: d.channelId,
      freight: d.frete.trim().replace(",", "."),
      freight_paid_by_customer: d.fretePorContaCliente,
      commission_rate: d.comissao,
    },
    p_items: d.itens.map((i) => ({
      product_id: i.tipo === "produto" ? i.refId : null,
      kit_id: i.tipo === "kit" ? i.refId : null,
      quantity: i.quantidade.trim().replace(",", "."),
      unit_price: i.precoVenda.trim().replace(",", "."),
    })),
  });
  if (error) throw error;
  return data as string;
}
