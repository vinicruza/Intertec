import { dec, margemPct, type ItemPedido } from "@calc";
import { supabase } from "../supabase";
import { AVISO_SEM_COTACAO_DE_FRETE, temCotacaoDeFrete } from "../format";
import { faixaDoPedido, seloExigeAprovacao, seloMargemComercial, simular, type Simulacao } from "../sim/params";
import { montarSnapshot, type ItemParaSnapshot, type SnapshotPedido } from "../sim/snapshot";
import { resolverKitAdHocDoPedido } from "../sim/itensDoPedido";
import {
  carregarContextoSimulador,
  custosDeEmbalagem,
  idsDeRetirada,
  listarTransportadoras,
  montarCatalogoDeKit,
  type ContextoSimulador,
} from "./pedidos";
import { type ModoEmbalagem } from "../sim/kitNoPedido";

export type FreteCotadoPedido = {
  id: string;
  carrierId: string | null;
  carrierName: string | null;
  carrierOther: string | null;
  amount: string | null;
  leadTimeDays: string | null;
  quoteCode: string | null;
  selected: boolean;
};

// ---------- Histórico ----------

export type PedidoResumo = {
  id: string;
  status: "simulation" | "closed" | "lost";
  approval_status: "rascunho" | "pendente" | "aprovado" | "recusado";
  approved_at: string | null;
  submitted_at: string | null;
  quote_number: string | null;
  order_number: string | null;
  uf: string | null;
  created_at: string;
  closed_at: string | null;
  lost_at: string | null;
  loss_notes: string | null;
  loss_reasons: { id: string; label: string } | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  revised_from_order_id: string | null;
  revision_reason: string | null;
  totals_display: Record<string, string> | null;
  contribution_margin_snapshot: string | null;
  net_revenue_snapshot: string | null;
  customers: {
    id: string;
    name: string;
    // Segmento do cliente — é por aqui que se responde "quantas cotações
    // foram para veterinário?" (reunião 16/07/2026).
    customer_types: { id: string; name: string } | null;
    customer_specialties: { id: string; name: string } | null;
  } | null;
  sellers: { id: string; name: string } | null;
  channels: { id: string; name: string } | null;
  order_items: Array<{
    item_name_snapshot: string | null;
    item_code_snapshot: string | null;
    // Kit montado no pedido e ainda sem código de catálogo: sem o rótulo, a
    // linha aparecia vazia na lista e na busca do histórico.
    ad_hoc_kit_label: string | null;
    // nf_description: o nome que sai na nota, ao lado do nome do catálogo.
    // Kits não têm — a nota do kit sai da composição, item por item.
    products: { name: string; code: string; nf_description: string | null } | null;
    kits: { name: string; code: string } | null;
  }>;
};

export async function listarPedidos(): Promise<PedidoResumo[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, status, approval_status, approved_at, submitted_at, quote_number, order_number, uf, created_at, closed_at, lost_at, loss_notes, cancelled_at, cancellation_reason, revised_from_order_id, revision_reason, totals_display, contribution_margin_snapshot, net_revenue_snapshot, customers(id, name, customer_types(id, name), customer_specialties(id, name)), sellers(id, name), channels(id, name), loss_reasons(id, label), order_items(item_name_snapshot, item_code_snapshot, ad_hoc_kit_label, products(name,code,nf_description), kits(name,code))"
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as PedidoResumo[];
}

export type PedidoCompleto = {
  id: string;
  status: "simulation" | "closed" | "lost";
  approval_status: "rascunho" | "pendente" | "aprovado" | "recusado";
  approved_at: string | null;
  approved_by: string | null;
  approval_notes: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  quote_number: string | null;
  order_number: string | null;
  uf: string | null;
  freight: string | null;
  freight_paid_by_customer: boolean;
  freight_quotes: FreteCotadoPedido[];
  commission_rate: string | null;
  // DIFAL: resolvido no pedido (05/08/2026), override do padrão do canal —
  // ver Calculations.md §12.
  applies_difal: boolean;
  // Destaque do DIFAL congelado no fechamento; nulo em pedido aberto e nos
  // fechados antes de 25/08/2026, que caem no destaque vigente da UF.
  difal_destacado_snapshot: boolean | null;
  channel_id: string | null;
  seller_id: string | null;
  created_at: string;
  closed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  revised_from_order_id: string | null;
  revision_reason: string | null;
  totals_display: Record<string, string> | null;
  // Escalar, para reabrir no Simulador (05/08/2026): a relação `customers`
  // abaixo só tem o que a FICHA precisa exibir (nome, CNPJ, CEPs...), não o
  // id — que é o que o formulário de edição precisa para pré-selecionar o
  // cliente no <select>.
  customer_id: string | null;
  // Expedição e condições do formulário de pedido (05/08/2026).
  carrier_id: string | null;
  carrier_other: string | null;
  weight_kg: string | null;
  volumes: number | null;
  // Como os volumes foram montados, em texto livre. `volumes` é o número que
  // conta; este campo é a memória de quem embalou.
  volumes_composition: string | null;
  shipping_zip: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  payment_term_id: string | null;
  payment_term_days: number | null;
  order_notes: string | null;
  carriers: { name: string; requires_name: boolean } | null;
  payment_terms: { label: string } | null;
  // O cabeçalho da ficha impressa sai daqui: é o cadastro do cliente que
  // preenche CNPJ, CEPs e contato, não uma digitação por pedido.
  customers: {
    external_code: string | null;
    name: string;
    tax_id: string | null;
    billing_zip: string | null;
    billing_city: string | null;
    billing_state: string | null;
    shipping_zip: string | null;
    shipping_city: string | null;
    shipping_state: string | null;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  sellers: { name: string } | null;
  revisoes: Array<{ id: string; status: "simulation" | "closed"; cancelled_at: string | null; created_at: string }>;
  itens: Array<{
    id: string;
    product_id: string | null;
    kit_id: string | null;
    quantity: string;
    unit_price: string;
    cmv_unit_snapshot: string | null;
    expense_unit_snapshot: string | null;
    kit_composition_snapshot: unknown | null;
    item_code_snapshot: string | null;
    products: { name: string; code: string; nf_description: string | null } | null;
    kits: { name: string; code: string } | null;
    // Kit montado NA HORA do pedido, ainda sem código de catálogo (reunião
    // 16/07/2026). Só existe enquanto o pedido não fecha — o fechamento
    // materializa em `kits` (materialize_ad_hoc_kits). Precisa vir junto para
    // reabrir a linha no montador de kit ao editar.
    ad_hoc_kit_composition: Array<{ product_id: string; quantity: string }> | null;
    ad_hoc_kit_packaging: Array<{
      input_id: string;
      quantity_type: "direct" | "lot";
      quantity: string | null;
      lot_size: string | null;
    }> | null;
    ad_hoc_kit_label: string | null;
    // Composição do kit montado no pedido já com o NOME de cada produto, para
    // a tela e a ficha impressa mostrarem o que vai dentro do kit antes de ele
    // virar kit de catálogo. Sem isto o item aparecia como "—" no detalhe e no
    // papel que vai para a conferência.
    ad_hoc_kit_composicao: Array<{ nome: string; quantidade: string }> | null;
  }>;
};

export async function obterPedidoCompleto(id: string): Promise<PedidoCompleto | null> {
  const { data: pedido, error } = await supabase
    .from("orders")
    .select(
      "id, status, approval_status, approved_at, approved_by, approval_notes, submitted_by, submitted_at, quote_number, order_number, uf, freight, freight_paid_by_customer, freight_quotes, commission_rate, applies_difal, difal_destacado_snapshot, customer_id, channel_id, seller_id, created_at, closed_at, cancelled_at, cancellation_reason, revised_from_order_id, revision_reason, totals_display, carrier_id, carrier_other, weight_kg, volumes, volumes_composition, shipping_zip, shipping_city, shipping_state, payment_term_id, payment_term_days, order_notes, carriers(name, requires_name), payment_terms(label), customers(external_code, name, tax_id, billing_zip, billing_city, billing_state, shipping_zip, shipping_city, shipping_state, contact_name, phone, email), sellers(name)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!pedido) return null;
  const { data: itens, error: e2 } = await supabase
    .from("order_items")
    .select(
      "id, product_id, kit_id, quantity, unit_price, cmv_unit_snapshot, expense_unit_snapshot, kit_composition_snapshot, item_code_snapshot, ad_hoc_kit_composition, ad_hoc_kit_packaging, ad_hoc_kit_label, products(name,code,nf_description), kits(name,code)"
    )
    .eq("order_id", id);
  if (e2) throw e2;
  const { data: revisoes, error: e3 } = await supabase
    .from("orders")
    .select("id, status, cancelled_at, created_at")
    .eq("revised_from_order_id", id)
    .order("created_at", { ascending: false });
  if (e3) throw e3;
  // A ficha precisa abrir a composição também quando o item já é um kit de
  // catálogo. Pedido fechado normalmente tem snapshot, mas cotação em aberto
  // ou dado antigo pode não ter; aí buscamos a receita atual do kit.
  const kitIds = [
    ...new Set((itens ?? []).flatMap((item) => (item.kit_id ? [item.kit_id as string] : []))),
  ];
  const composicaoPorKit = new Map<string, Array<{ nome: string; quantidade: string }>>();
  if (kitIds.length > 0) {
    const { data: kitItems, error: e4 } = await supabase
      .from("kit_items")
      .select("kit_id, quantity, products(name)")
      .in("kit_id", kitIds);
    if (e4) throw e4;
    for (const ki of kitItems ?? []) {
      const lista = composicaoPorKit.get(ki.kit_id as string) ?? [];
      const produto = Array.isArray(ki.products) ? ki.products[0] ?? null : ki.products;
      lista.push({
        nome: (produto as { name?: string } | null)?.name ?? "?",
        quantidade: String(ki.quantity),
      });
      composicaoPorKit.set(ki.kit_id as string, lista);
    }
  }
  // Nome dos produtos que só existem dentro de um kit montado no pedido (esses
  // não têm product_id na linha, então não vêm pela relação `products`).
  const idsAdHoc = [
    ...new Set(
      (itens ?? []).flatMap((item) =>
        ((item.ad_hoc_kit_composition ?? []) as Array<{ product_id: string }>).map((c) => c.product_id)
      )
    ),
  ];
  const nomePorProdutoAdHoc = new Map<string, string>();
  if (idsAdHoc.length > 0) {
    const { data: prods, error: e4 } = await supabase
      .from("products")
      .select("id, name")
      .in("id", idsAdHoc);
    if (e4) throw e4;
    for (const p of prods ?? []) nomePorProdutoAdHoc.set(p.id as string, p.name as string);
  }

  const itensNormalizados = (itens ?? []).map((item) => {
    const composicao = (item.ad_hoc_kit_composition ?? []) as Array<{ product_id: string; quantity: string }>;
    return {
      ...item,
      quantity: String(item.quantity),
      unit_price: String(item.unit_price),
      cmv_unit_snapshot: item.cmv_unit_snapshot == null ? null : String(item.cmv_unit_snapshot),
      expense_unit_snapshot: item.expense_unit_snapshot == null ? null : String(item.expense_unit_snapshot),
      kit_composition_snapshot:
        item.kit_composition_snapshot ??
        (item.kit_id ? composicaoPorKit.get(item.kit_id as string) ?? null : null),
      ad_hoc_kit_composicao:
        composicao.length === 0
          ? null
          : composicao.map((c) => ({
              nome: nomePorProdutoAdHoc.get(c.product_id) ?? c.product_id,
              quantidade: String(c.quantity),
            })),
    };
  });
  const bruto = pedido as unknown as Omit<PedidoCompleto, "itens" | "revisoes">;
  return {
    ...bruto,
    // Peso vem numeric do banco: normalizado a texto como o resto dos números,
    // para não passear como float pela tela.
    weight_kg: bruto.weight_kg == null ? null : String(bruto.weight_kg),
    itens: itensNormalizados as unknown as PedidoCompleto["itens"],
    revisoes: (revisoes ?? []) as PedidoCompleto["revisoes"],
  };
}

// ---------- Expedição (formulário de pedido, 05/08/2026) ----------
//
// Separada do resto porque tem um ciclo de vida diferente: peso e volume só
// existem quando alguém embala a caixa, o que costuma ser DEPOIS de o pedido
// ter sido ganho. O banco abre exatamente esta exceção — e só ela — na regra
// de imutabilidade (migração 20260805001100), com registro em auditoria.
export type DadosExpedicao = {
  carrierId: string | null;
  carrierOutra: string | null;
  fretesCotados: FreteCotadoPedido[];
  pesoKg: string | null;
  volumes: string | null;
  composicaoVolumes: string | null;
  cepEntrega: string | null;
  cidadeEntrega: string | null;
  ufEntrega: string | null;
  modoPagamentoId: string | null;
  prazoPagamentoDias: string | null;
  observacao: string | null;
};

export async function salvarExpedicao(orderId: string, d: DadosExpedicao): Promise<void> {
  const numero = (v: string | null) => {
    const limpo = (v ?? "").trim().replace(",", ".");
    return limpo === "" ? null : limpo;
  };
  const { error } = await supabase.rpc("update_order_shipping", {
    p_order_id: orderId,
    p_carrier_id: d.carrierId || null,
    p_carrier_other: d.carrierOutra?.trim() || null,
    p_weight_kg: numero(d.pesoKg),
    p_volumes: numero(d.volumes),
    p_volumes_composition: d.composicaoVolumes?.trim() || null,
    p_shipping_zip: d.cepEntrega?.replace(/\D/g, "") || null,
    p_shipping_city: d.cidadeEntrega?.trim() || null,
    p_shipping_state: d.ufEntrega?.trim().toUpperCase() || null,
    p_payment_term_id: d.modoPagamentoId || null,
    p_payment_term_days: numero(d.prazoPagamentoDias),
    p_order_notes: d.observacao?.trim() || null,
  });
  if (error) throw error;
  const { error: erroFretes } = await supabase
    .from("orders")
    .update({ freight_quotes: d.fretesCotados })
    .eq("id", orderId);
  if (erroFretes) throw erroFretes;
}

// ---------- Fechamento (D7) ----------

// Fecha o pedido: calcula com os custos VIGENTES, grava o snapshot nos itens
// e no pedido e muda o status. A partir daí o banco impede qualquer alteração
// (trigger da Sprint 2). Reabrir: só Admin, gera trilha de auditoria.
// Monta a cascata (preço, CMV, margem) com os custos VIGENTES agora — os
// mesmos que o fechamento usaria se fosse fechado neste instante. Reaproveitada
// em dois lugares: no fechamento de verdade (que grava o snapshot) e na
// pré-visualização de quem aprova (que só EXIBE, sem gravar nada — o snapshot
// nasce só no fechamento, Decisão D7).
// Exportada para a fila de Aprovações (avaliarMargensPendentes em
// aprovacao.ts): ela avalia vários pedidos de uma vez e precisa carregar o
// contexto do simulador só UMA vez para todos, não um a um.
export async function simularPedidoComCustosVigentes(
  pedido: PedidoCompleto,
  ctx: ContextoSimulador
): Promise<{ sim: Simulacao; snap: SnapshotPedido }> {
  const tabela = ctx.tabelaPorUF.get(pedido.uf ?? "");
  if (!tabela) throw new Error(`UF ${pedido.uf ?? "—"} sem alíquotas cadastradas.`);
  const vendedor = ctx.vendedores.find((v) => v.id === pedido.seller_id);
  if (!vendedor) throw new Error("Pedido sem vendedor/canal definido.");
  const canal = ctx.canais.find((c) => c.id === pedido.channel_id) ??
    ctx.canais.find((c) => c.id === vendedor.channel_id);
  if (!canal) throw new Error("Pedido sem situação de cálculo definida.");

  const custoPorItemVendavel = new Map(ctx.itens.map((i) => [i.id, i]));

  // Composição expandida dos kits do pedido (D7): produto, quantidade e CMV do momento.
  const kitIds = pedido.itens.filter((i) => i.kit_id).map((i) => i.kit_id as string);
  const composicaoPorKit = new Map<string, Array<{ produtoId: string; nome: string; quantidade: string; cmvUnitario: string }>>();
  if (kitIds.length > 0) {
    const [{ data: kitItems, error: e1 }, { data: custos, error: e2 }] = await Promise.all([
      supabase.from("kit_items").select("kit_id, product_id, quantity, products(name)").in("kit_id", kitIds),
      supabase.from("product_costs").select("product_id, cmv"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const cmvPorProduto = new Map((custos ?? []).map((c) => [c.product_id as string, c.cmv as string]));
    for (const ki of kitItems ?? []) {
      const lista = composicaoPorKit.get(ki.kit_id as string) ?? [];
      lista.push({
        produtoId: ki.product_id as string,
        nome: (ki.products as unknown as { name: string } | null)?.name ?? "?",
        quantidade: ki.quantity as string,
        cmvUnitario: cmvPorProduto.get(ki.product_id as string) ?? "0",
      });
      composicaoPorKit.set(ki.kit_id as string, lista);
    }
  }

  // Kit montado no pedido e ainda não materializado (o código oficial só nasce
  // quando o pedido é ganho): não tem product_id nem kit_id, então não está em
  // ctx.itens. Sem isto o item entrava com CMV 0 e derrubava a conta inteira —
  // e quem sentia era justamente quem ia APROVAR, que via "CMV zerado" no
  // lugar da margem que foi chamado para conferir.
  // O custo da embalagem dos kits montados no pedido vem do banco — a tela não
  // recebe o preço dos insumos. Sem isto, o kit ad hoc fecharia sem a embalagem
  // e a revalidação do servidor recusaria o pedido.
  const embalagemAdHoc = pedido.itens.flatMap((i) =>
    (i.ad_hoc_kit_packaging ?? []).map((e) => ({
      insumoId: e.input_id,
      modo: (e.quantity_type === "lot" ? "itensPorCaixa" : "porKit") as ModoEmbalagem,
      quantidade: String(e.quantity_type === "lot" ? e.lot_size : e.quantity),
    }))
  );
  const catalogoKit = montarCatalogoDeKit(ctx, await custosDeEmbalagem(embalagemAdHoc));
  const nomePorProduto = new Map(ctx.produtos.map((p) => [p.id, p.nome]));

  // Monta itens do motor e do snapshot com os custos vigentes.
  const itensMotor: ItemPedido[] = [];
  const itensSnapshot: ItemParaSnapshot[] = [];
  for (const item of pedido.itens) {
    const adHoc = !item.product_id && !item.kit_id && item.ad_hoc_kit_composition
      ? resolverKitAdHocDoPedido(item, catalogoKit, nomePorProduto)
      : null;

    const refId = (item.product_id ?? item.kit_id) as string;
    const vendavel = adHoc ? null : custoPorItemVendavel.get(refId);
    const cmv = (adHoc ? adHoc.cmvUnitario : vendavel?.cmvUnitario) ?? "0"; // 0 → erro bloqueante no motor
    const despesa = vendavel?.despesaUnitaria ?? "0";
    itensMotor.push({
      nome: adHoc?.nome ?? vendavel?.nome ?? refId,
      precoVenda: item.unit_price,
      quantidade: item.quantity,
      cmvUnitario: cmv,
      despesaUnitaria: despesa,
    });
    itensSnapshot.push({
      orderItemId: item.id,
      precoVenda: item.unit_price,
      quantidade: item.quantity,
      cmvUnitario: cmv,
      despesaUnitaria: despesa,
      composicaoKit: adHoc
        ? adHoc.composicao
        : item.kit_id
          ? composicaoPorKit.get(item.kit_id) ?? null
          : null,
    });
  }

  // Lança ErroCalculoBloqueante se algum item tiver CMV zerado (T9).
  const sim = simular({
    itens: itensMotor,
    freteManual: pedido.freight ?? "0",
    fretePorContaCliente: pedido.freight_paid_by_customer,
    freteJaDestacadoNosPrecos: pedido.freight_paid_by_customer,
    comissao: pedido.commission_rate,
    aplicaDifal: pedido.applies_difal,
    canal: canal.regras,
    uf: tabela,
  });

  return { sim, snap: montarSnapshot(sim, tabela.aliquotaIcsm, itensSnapshot) };
}

// Kits que o fechamento materializou. `novo` distingue o que ganhou código
// agora do que reaproveitou um código existente (composição repetida).
export type KitMaterializado = { id: string; code: string | null; name: string; novo: boolean };

export async function fecharPedido(orderId: string): Promise<KitMaterializado[]> {
  const pedidoAntes = await obterPedidoCompleto(orderId);
  if (!pedidoAntes) throw new Error("Pedido não encontrado.");
  if (pedidoAntes.status === "closed") throw new Error("Pedido já está fechado.");
  if (pedidoAntes.status === "lost") throw new Error("Cotação marcada como perdida — reabra antes de fechar.");
  if (pedidoAntes.cancelled_at) throw new Error("Pedido cancelado não pode ser fechado.");
  // Intertech, 26/08/2026. Fica aqui além da tela porque "Gerar Pedido" não é
  // o único caminho até o fechamento, e a regra não pode depender de qual
  // botão a pessoa apertou. A retirada escolhida dispensa o valor (02/09/2026),
  // e por isso a lista de transportadoras é lida aqui: é ela que diz qual
  // opção é retirada.
  if (!temCotacaoDeFrete(pedidoAntes.freight_quotes, idsDeRetirada(await listarTransportadoras()))) {
    throw new Error(AVISO_SEM_COTACAO_DE_FRETE);
  }

  // O código oficial do kit só nasce agora (reunião 16/07/2026). Os kits
  // montados dentro do pedido viram kits de catálogo aqui — reaproveitando o
  // código quando a mesma composição já existe. Precisa vir ANTES de ler o
  // pedido para fechamento, porque a materialização preenche o kit_id dos itens.
  const { data: kitsMaterializados, error: erroKits } = await supabase.rpc("materialize_ad_hoc_kits", {
    p_order_id: orderId,
  });
  if (erroKits) throw erroKits;

  const pedido = await obterPedidoCompleto(orderId);
  if (!pedido) throw new Error("Pedido não encontrado.");
  if (pedido.status === "closed") throw new Error("Pedido já está fechado.");
  if (pedido.status === "lost") throw new Error("Cotação marcada como perdida — reabra antes de fechar.");
  if (pedido.cancelled_at) throw new Error("Pedido cancelado não pode ser fechado.");
  if (!pedido.uf) throw new Error("Fechamento exige UF definida.");

  const ctx = await carregarContextoSimulador();
  const { sim, snap } = await simularPedidoComCustosVigentes(pedido, ctx);
  const precisaAprovacao = seloExigeAprovacao(
    seloMargemComercial(
      sim.resultado.margemContribuicaoPct,
      faixaDoPedido(ctx.faixasMargem, { channelId: pedido.channel_id, sellerId: pedido.seller_id })
    )
  );
  if (precisaAprovacao || pedido.approval_status === "aprovado") {
    const { error: erroAprovacao } = await supabase.rpc("assert_order_approved", { p_order_id: orderId });
    if (erroAprovacao) throw erroAprovacao;
  }

  // Snapshot dos itens e do pedido são persistidos na mesma transação.
  const { error } = await supabase.rpc("close_order_with_snapshots", {
    p_order_id: orderId,
    p_order_snapshot: snap.pedido,
    p_item_snapshots: snap.itens,
    p_freight: sim.freteUsado.toString(),
    p_commission_rate: sim.comissaoUsada.toString(),
  });
  if (error) throw error;

  // Quem fechou precisa saber qual código nasceu — senão vai procurar na tela
  // de Kits para descobrir o código do que acabou de criar.
  return (kitsMaterializados as KitMaterializado[] | null) ?? [];
}

// ---------- Pré-visualização para quem aprova (nada é gravado) ----------
//
// O pedido pendente de aprovação ainda está em simulação: CMV, margem e a
// cascata inteira só são gravados no FECHAMENTO (Decisão D7), então
// `pedido.totals_display` está vazio enquanto aprova. Sem isto, o card de
// aprovação pedia para "conferir CMV e margem" sem mostrar nenhum dos dois.
export type CascataVigente =
  | {
      ok: true;
      totals: Record<string, string>;
      cmvPorItem: Map<string, string>;
      margemContribuicaoPct: string;
      // Destaque VIGENTE da UF. Pedido fechado não usa este campo: ele lê o
      // que ficou congelado em `difal_destacado_snapshot` (D7).
      difalDestacado: boolean;
    }
  | { ok: false; erro: string };

export async function calcularCascataVigente(orderId: string): Promise<CascataVigente> {
  const pedido = await obterPedidoCompleto(orderId);
  if (!pedido) return { ok: false, erro: "Pedido não encontrado." };
  if (!pedido.uf) return { ok: false, erro: "Pedido sem UF definida." };
  if (pedido.itens.length === 0) return { ok: false, erro: "Pedido sem itens." };

  try {
    const ctx = await carregarContextoSimulador();
    const { snap } = await simularPedidoComCustosVigentes(pedido, ctx);
    return {
      ok: true,
      totals: snap.pedido.totals_display,
      cmvPorItem: new Map(snap.itens.map((i) => [i.orderItemId, i.cmv_unit_snapshot])),
      margemContribuicaoPct: margemPct(
        dec(snap.pedido.contribution_margin_snapshot),
        dec(snap.pedido.net_revenue_snapshot)
      ).toString(),
      difalDestacado: ctx.difalDestacadoPorUF.get(pedido.uf) ?? false,
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não foi possível calcular a cascata." };
  }
}

// Pedido fechado permanece imutável; a revisão é uma nova simulação vinculada.
export async function reabrirPedido(orderId: string): Promise<string> {
  const { data, error } = await supabase.rpc("copy_order_as_simulation", {
    p_order_id: orderId,
    p_reason: "revision",
  });
  if (error) throw error;
  return data as string;
}

// Duplicar como nova simulação (PRD §6.7): copia dados e itens, sem snapshots.
export async function duplicarPedido(orderId: string): Promise<string> {
  const { data, error } = await supabase.rpc("copy_order_as_simulation", {
    p_order_id: orderId,
    p_reason: "duplicate",
  });
  if (error) throw error;
  return data as string;
}

export async function cancelarPedido(orderId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId, p_reason: motivo });
  if (error) throw error;
}

// Nome de quem aprovou, para a ficha (pedido da Intertech em 21/08/2026).
//
// Vai por RPC porque a política `profiles_select` só deixa cada pessoa ler o
// próprio perfil: o embed do PostgREST voltaria nulo para a vendedora, sem
// erro. `nome_do_usuario` devolve só o nome, dentro do mesmo tenant.
export async function nomeDoUsuario(id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data, error } = await supabase.rpc("nome_do_usuario", { p_id: id });
  if (error) return null; // a ficha não deixa de imprimir por causa do nome
  return (data as string | null) ?? null;
}
