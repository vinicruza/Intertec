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

// Insumo disponível como embalagem/esterilização do kit montado no simulador.
export type InsumoEmbalagem = {
  id: string;
  nome: string;
  precoSemImposto: string | null;
  maoDeObra: boolean;
  // Marcado como embalagem/esterilização (envelope, caixa...). É o que filtra
  // a lista no montador de kit — sem isso, aparecia todo insumo do catálogo.
  embalagem: boolean;
};

export type ContextoSimulador = {
  vendedores: VendedorOpcao[];
  // Vendedor vinculado a quem está usando o sistema (null se não houver).
  // O Comercial só lança pedido para ele — a trava de verdade é o gatilho
  // trg_orders_vendedor_do_acesso, no banco; aqui a lista já vem filtrada
  // para a pessoa não escolher errado e só descobrir ao salvar.
  meuVendedorId: string | null;
  clientes: Array<{
    id: string;
    name: string;
    uf: string | null;
    tax_id: string | null;
    billing_zip: string | null;
    shipping_zip: string | null;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
  }>;
  ufs: string[]; // UFs com alíquota ICSM cadastrada
  tabelaPorUF: Map<string, TabelasUF>;
  itens: ItemVendavel[];
  regrasMargem: RegraMargem[];
  // Para montar kit dentro do pedido (reunião 16/07/2026):
  produtos: Array<{ id: string; nome: string; codigo: string; cmv: string | null }>;
  insumosEmbalagem: InsumoEmbalagem[];
  // Assinatura → kit existente, para avisar na hora que a composição já existe.
  kitPorAssinatura: Map<string, { id: string; codigo: string; nome: string }>;
  // Transportadoras do formulário de pedido (05/08/2026).
  transportadoras: Array<{ id: string; nome: string; pedeNome: boolean }>;
};

export async function carregarContextoSimulador(): Promise<ContextoSimulador> {
  const [vend, cli, icsm, difal, portal, regras, prods, custos, kits, insumos, meuVend, transp] = await Promise.all([
    supabase.from("sellers").select("id, name, channel_id, channels(name, applies_difal, default_commission_rate, freight_model)").eq("active", true).order("name"),
    // O cadastro do cliente carrega os dados do cabeçalho da ficha; o
    // simulador só precisa saber quais já estão preenchidos, para avisar
    // antes de o pedido chegar à conferência com o cabeçalho vazio.
    supabase.from("customers").select("id, name, uf, tax_id, billing_zip, shipping_zip, contact_name, phone, email").eq("active", true).order("name"),
    supabase.from("icsm_rates").select("uf, icms_rate, pis_cofins_rate"),
    supabase.from("difal_rates").select("uf, final_rate"),
    supabase.from("portal_freight_rates").select("uf, freight_percent"),
    supabase.from("margin_rules").select("label, min_rate, max_rate, color, sort_order"),
    supabase.from("products").select("id, code, name").eq("status", "active").order("name"),
    supabase.from("product_costs").select("product_id, cmv, cmv_without_labor"),
    supabase
      .from("kits")
      .select("id, code, name, signature, kit_items(product_id, quantity), kit_packaging(quantity_type, quantity, lot_size, inputs(name, price_without_tax, is_labor))")
      .eq("status", "active")
      .order("name"),
    supabase.from("inputs").select("id, name, price_without_tax, is_labor, is_packaging").eq("status", "active").order("name"),
    supabase.rpc("meu_vendedor"),
    supabase.from("carriers").select("id, name, requires_name").eq("active", true).order("sort_order"),
  ]);
  for (const r of [vend, cli, icsm, difal, portal, regras, prods, custos, kits, insumos, meuVend, transp]) {
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
    quantity_type: "direct" | "lot";
    quantity: string | null;
    lot_size: string | null;
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
        quantidade: e.quantity_type === "lot"
          ? { tipo: "lote" as const, tamanhoLote: String(e.lot_size) }
          : { tipo: "direta" as const, quantidade: String(e.quantity) },
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

  // Assinatura → kit já cadastrado. Serve para o simulador avisar, enquanto a
  // pessoa monta, que aquela composição já existe e tem código.
  const kitPorAssinatura = new Map<string, { id: string; codigo: string; nome: string }>();
  for (const k of kits.data ?? []) {
    const assinatura = k.signature as string | null;
    if (assinatura) {
      kitPorAssinatura.set(assinatura, {
        id: k.id as string,
        codigo: (k.code as string | null) ?? "—",
        nome: k.name as string,
      });
    }
  }

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
    meuVendedorId: (meuVend.data as string | null) ?? null,
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
    clientes: (cli.data ?? []) as ContextoSimulador["clientes"],
    ufs: [...tabelaPorUF.keys()].sort(),
    tabelaPorUF,
    itens: [...itensProdutos, ...itensKits],
    regrasMargem: (regras.data ?? []) as RegraMargem[],
    produtos: (prods.data ?? []).map((p) => ({
      id: p.id as string,
      nome: p.name as string,
      codigo: p.code as string,
      cmv: custoPorProduto.get(p.id as string)?.cmv.toString() ?? null,
    })),
    insumosEmbalagem: (insumos.data ?? []).map((i) => ({
      id: i.id as string,
      nome: i.name as string,
      precoSemImposto: (i.price_without_tax as string | null) ?? null,
      maoDeObra: (i.is_labor as boolean | null) ?? false,
      embalagem: (i.is_packaging as boolean | null) ?? false,
    })),
    kitPorAssinatura,
    transportadoras: (transp.data ?? []).map((t) => ({
      id: t.id as string,
      nome: t.name as string,
      pedeNome: (t.requires_name as boolean | null) ?? false,
    })),
  };
}

// ---------- Gravação da simulação ----------

export type ItemSimulacao = {
  // "kitNovo" = kit montado dentro do pedido, ainda sem código oficial. Ele só
  // vira kit de catálogo quando o pedido é ganho (reunião 16/07/2026).
  tipo: "produto" | "kit" | "kitNovo";
  refId: string; // vazio quando tipo = kitNovo
  quantidade: string;
  precoVenda: string;
  kitNovo?: {
    assinatura: string;
    composicao: Array<{ produtoId: string; quantidade: string }>;
    embalagem: Array<{ insumoId: string; modo: "porKit" | "itensPorCaixa"; quantidade: string }>;
    rotulo: string;
  };
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
  // Expedição e condições do formulário de pedido (05/08/2026). Nada aqui
  // entra em cálculo: é o que a expedição lê para despachar e o financeiro
  // lê para cobrar.
  transportadoraId: string | null;
  transportadoraOutra: string | null;
  pesoKg: string | null;
  volumes: string | null;
  cepEntrega: string | null;
  prazoPagamentoDias: string | null;
  observacao: string | null;
};

// Salva a cotação e EMPILHA UMA VERSÃO (reunião 16/07/2026: "se ele faz 10
// alterações, vamos registrar as 10"). Snapshots financeiros continuam sendo
// gravados só no fechamento (D7).
//
// Passe `orderId` para revisar uma cotação existente; null cria uma nova.
export type ResultadoCotacao = { id: string; version: number; quote_number: string };

// Campo numérico vazio vira string vazia, que a função do banco trata como
// nulo. Vírgula decimal do teclado brasileiro entra aqui: "12,5" é 12.5.
function numeroOuVazio(valor: string | null | undefined): string {
  return (valor ?? "").trim().replace(",", ".");
}

export async function salvarCotacao(
  orderId: string | null,
  d: DadosSimulacao,
  fotoDaCotacao: unknown = {}
): Promise<ResultadoCotacao> {
  const { data, error } = await supabase.rpc("save_quote_revision", {
    p_order_id: orderId,
    p_order: {
      customer_id: d.clienteId,
      customer_name: d.clienteNovoNome?.trim() || null,
      uf: d.uf,
      seller_id: d.vendedorId,
      channel_id: d.channelId,
      freight: d.frete.trim().replace(",", "."),
      freight_paid_by_customer: d.fretePorContaCliente,
      commission_rate: d.comissao,
      carrier_id: d.transportadoraId,
      carrier_other: d.transportadoraOutra,
      weight_kg: numeroOuVazio(d.pesoKg),
      volumes: numeroOuVazio(d.volumes),
      shipping_zip: d.cepEntrega,
      payment_term_days: numeroOuVazio(d.prazoPagamentoDias),
      order_notes: d.observacao,
    },
    p_items: d.itens.map((i) => ({
      product_id: i.tipo === "produto" ? i.refId : null,
      kit_id: i.tipo === "kit" ? i.refId : null,
      quantity: i.quantidade.trim().replace(",", "."),
      unit_price: i.precoVenda.trim().replace(",", "."),
      ad_hoc_kit_signature: i.kitNovo?.assinatura ?? null,
      ad_hoc_kit_composition: i.kitNovo
        ? i.kitNovo.composicao.map((c) => ({ product_id: c.produtoId, quantity: c.quantidade }))
        : null,
      ad_hoc_kit_packaging: i.kitNovo
        ? i.kitNovo.embalagem.map((e) => ({
            input_id: e.insumoId,
            quantity_type: e.modo === "itensPorCaixa" ? "lot" : "direct",
            quantity: e.modo === "porKit" ? e.quantidade : null,
            lot_size: e.modo === "itensPorCaixa" ? e.quantidade : null,
          }))
        : null,
      ad_hoc_kit_label: i.kitNovo?.rotulo ?? null,
    })),
    p_snapshot: fotoDaCotacao,
  });
  if (error) throw error;
  return data as ResultadoCotacao;
}

// ---------- Transportadoras ativas ----------
//
// Lista enxuta para a tela do pedido. O simulador já recebe as mesmas
// transportadoras dentro do contexto; aqui é para quem só precisa delas.
export type TransportadoraOpcao = { id: string; nome: string; pedeNome: boolean };

export async function listarTransportadoras(): Promise<TransportadoraOpcao[]> {
  const { data, error } = await supabase
    .from("carriers")
    .select("id, name, requires_name")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id as string,
    nome: t.name as string,
    pedeNome: (t.requires_name as boolean | null) ?? false,
  }));
}

// ---------- Desfecho da cotação ----------

export type MotivoPerda = { id: string; label: string; sort_order: number };

export async function listarMotivosPerda(): Promise<MotivoPerda[]> {
  const { data, error } = await supabase
    .from("loss_reasons")
    .select("id, label, sort_order")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as MotivoPerda[];
}

// Nem toda cotação vira pedido. Sem o motivo registrado, não há como responder
// depois "por que a gente não vendeu?".
export async function marcarCotacaoPerdida(
  orderId: string,
  motivoId: string,
  observacao: string
): Promise<void> {
  const { error } = await supabase.rpc("mark_order_lost", {
    p_order_id: orderId,
    p_loss_reason_id: motivoId,
    p_notes: observacao.trim() || null,
  });
  if (error) throw error;
}

export async function reabrirCotacaoPerdida(orderId: string): Promise<void> {
  const { error } = await supabase.rpc("reopen_lost_order", { p_order_id: orderId });
  if (error) throw error;
}

// ---------- Histórico de versões da cotação ----------

export type VersaoCotacao = {
  version: number;
  snapshot: Record<string, unknown>;
  created_at: string;
};

export async function listarVersoes(orderId: string): Promise<VersaoCotacao[]> {
  const { data, error } = await supabase
    .from("order_versions")
    .select("version, snapshot, created_at")
    .eq("order_id", orderId)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as VersaoCotacao[];
}
