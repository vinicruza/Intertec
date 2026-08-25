import { Decimal, type CustoProdutoKit } from "@calc";
import { supabase } from "../supabase";
import { chaveDaEmbalagem, type CatalogoParaKit, type EmbalagemDoKit, type PapelNoKit } from "../sim/kitNoPedido";
import type { KitParaCopiar } from "../sim/itensDoPedido";
import type { CanalRegras, RegraMargem, TabelasUF } from "../sim/params";
import { normalizarFreteCotado, numeroDigitado, type FreteCotado } from "../format";

// ---------- Contexto do simulador (tudo que a tela precisa) ----------

export type VendedorOpcao = {
  id: string;
  name: string;
  channel_id: string;
  canalNome: string;
  regras: CanalRegras;
};

export type CanalOpcao = {
  id: string;
  name: string;
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
export type { PapelNoKit };

export type InsumoEmbalagem = {
  id: string;
  nome: string;
  precoSemImposto: string | null;
  maoDeObra: boolean;
  // Marcado como embalagem/esterilização (envelope, caixa...). É o que filtra
  // a lista no montador de kit — sem isso, aparecia todo insumo do catálogo.
  embalagem: boolean;
  // Papel na embalagem do kit, definido no banco (coluna `kit_role`). O
  // formulário do montador é feito em cima disto: uma lista por papel, e as
  // linhas "automatico" entram sozinhas. Nulo = não participa da embalagem.
  papel: PapelNoKit | null;
};


export type ContextoSimulador = {
  vendedores: VendedorOpcao[];
  // Situações de cálculo da planilha: Interno, Marketplace, Externos,
  // Revendas e Descpro. Administrador pode trocar a situação sem trocar o
  // vendedor; Comercial fica preso ao canal do próprio vendedor.
  canais: CanalOpcao[];
  // Vendedor que tem o mesmo nome do acesso logado. Comercial lança pedido
  // somente em nome próprio; Administrador continua podendo escolher qualquer
  // vendedor. A trava definitiva fica no banco.
  meuVendedorId: string | null;
  clientes: Array<{
    id: string;
    external_code: string | null;
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
  // Inclui kit inativo (`ativo: false`): a assinatura é única no banco
  // independentemente do status, então a composição igual à de um kit inativo
  // não ganha código novo — cai no kit inativo.
  kitPorAssinatura: Map<string, { id: string; codigo: string; nome: string; ativo: boolean }>;
  // Kits ativos com a composição aberta, para "partir de um kit existente" no
  // montador — montar "o kit catarata mais uma compressa" sem reescolher tudo.
  kitsParaCopiar: KitParaCopiar[];
  // Transportadoras do formulário de pedido (05/08/2026).
  transportadoras: Array<{ id: string; nome: string; pedeNome: boolean }>;
  modosPagamento: Array<{ id: string; label: string }>;
};

export async function carregarContextoSimulador(): Promise<ContextoSimulador> {
  const [vend, canais, cli, icsm, difal, portal, regras, prods, custos, kits, insumos, custoKits, meuVend, transp, pagamento] = await Promise.all([
    supabase.from("sellers").select("id, name, channel_id, channels(name, applies_difal, default_commission_rate, freight_model)").eq("active", true).order("name"),
    supabase.from("channels").select("id, name, applies_difal, default_commission_rate, freight_model").order("name"),
    // O cadastro do cliente carrega os dados do cabeçalho da ficha; o
    // simulador só precisa saber quais já estão preenchidos, para avisar
    // antes de o pedido chegar à conferência com o cabeçalho vazio.
    supabase.from("customers").select("id, external_code, name, uf, tax_id, billing_zip, shipping_zip, contact_name, phone, email").eq("active", true).order("name"),
    supabase.from("icsm_rates").select("uf, icms_rate, pis_cofins_rate"),
    supabase.from("difal_rates").select("uf, final_rate, charges_difal"),
    supabase.from("portal_freight_rates").select("uf, freight_percent"),
    supabase.from("margin_rules").select("label, min_rate, max_rate, color, sort_order"),
    supabase.from("products").select("id, code, name").eq("status", "active").order("name"),
    supabase.from("product_costs").select("product_id, cmv, cmv_without_labor"),
    // Sem filtro de status: o kit INATIVO não pode ser vendido (ele não entra
    // na lista de itens abaixo), mas a assinatura dele continua ocupando o
    // índice único — precisa aparecer no aviso de "esta composição já existe".
    supabase
      .from("kits")
      .select("id, code, name, status, signature, kit_items(product_id, quantity), kit_packaging(input_id, quantity_type, quantity, lot_size)")
      .order("name"),
    // Pela RPC, e não pela tabela: `inputs` é fechada ao Comercial por decisão
    // de acesso (RLS), e a leitura direta voltava VAZIA para ele — sem erro,
    // só um seletor de embalagem em branco. A RPC devolve o NOME sem o preço.
    supabase.rpc("insumos_para_embalagem"),
    // CMV do kit pronto do servidor: produtos + embalagem. Calcular aqui exigia
    // o preço dos insumos, que o Comercial não lê — a embalagem sumia e o kit
    // ficava barato demais na tela, para ser recusado no fechamento depois.
    supabase.rpc("custo_dos_kits"),
    supabase.rpc("meu_vendedor"),
    supabase.from("carriers").select("id, name, requires_name").eq("active", true).order("sort_order"),
    supabase.from("payment_terms").select("id, label").eq("active", true).order("sort_order"),
  ]);
  for (const r of [vend, canais, cli, icsm, difal, portal, regras, prods, custos, kits, insumos, custoKits, meuVend, transp, pagamento]) {
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
    input_id: string;
    quantity_type: "direct" | "lot";
    quantity: string | null;
    lot_size: string | null;
  };

  // Kit: CMV = produtos + embalagem/esterilização (Calculations.md §4 — envelope
  // e caixa são consumidos UMA vez por kit). A conta é feita no banco.
  const cmvPorKit = new Map<string, string>(
    ((custoKits.data ?? []) as Array<{ kit_id: string; cmv: string | number }>)
      .filter((r) => Number(r.cmv) > 0)
      .map((r) => [r.kit_id, String(r.cmv)])
  );

  const itensKits: ItemVendavel[] = (kits.data ?? []).filter((k) => k.status === "active").map((k) => {
    // O CMV do kit (produtos + embalagem) vem calculado do banco: montar a
    // conta aqui exigiria o preço de cada insumo, e o Comercial não o lê.
    const cmv = cmvPorKit.get(k.id as string) ?? null;

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
  const kitPorAssinatura = new Map<string, { id: string; codigo: string; nome: string; ativo: boolean }>();
  for (const k of kits.data ?? []) {
    const assinatura = k.signature as string | null;
    if (assinatura) {
      kitPorAssinatura.set(assinatura, {
        id: k.id as string,
        codigo: (k.code as string | null) ?? "—",
        nome: k.name as string,
        ativo: k.status === "active",
      });
    }
  }

  // Composição aberta dos kits ativos, no formato do montador.
  const kitsParaCopiar: KitParaCopiar[] = (kits.data ?? [])
    .filter((k) => k.status === "active")
    .map((k) => ({
      id: k.id as string,
      codigo: (k.code as string | null) ?? "—",
      nome: k.name as string,
      produtos: (k.kit_items as Array<{ product_id: string; quantity: string }>).map((i) => ({
        produtoId: i.product_id,
        quantidade: String(i.quantity),
      })),
      embalagem: ((k.kit_packaging ?? []) as EmbalagemBruta[]).map((e) => ({
        insumoId: e.input_id,
        modo: (e.quantity_type === "lot" ? "itensPorCaixa" : "porKit") as "itensPorCaixa" | "porKit",
        quantidade: String(e.quantity_type === "lot" ? e.lot_size : e.quantity),
      })),
    }));

  const tabelaPorUF = new Map<string, TabelasUF>();
  // UF que não cobra DIFAL entra como zero, e não some da tabela: a alíquota
  // continua registrada em Configurações para quando voltar a valer. A regra é
  // E lógico com o pedido — a UF precisa cobrar E o pedido precisa aplicar
  // (canal Revendas/Descpro, ou a marcação manual do simulador).
  const difalPorUF = new Map(
    (difal.data ?? []).map((d) => [
      d.uf as string,
      (d.charges_difal as boolean | null) === false ? "0" : (d.final_rate as string),
    ])
  );
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
    canais: (canais.data ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      regras: {
        aplicaDifal: (c.applies_difal as boolean | null) ?? true,
        comissaoPadrao: (c.default_commission_rate as string | null) ?? "0.025",
        modeloFrete: ((c.freight_model as string | null) ?? "manual") as "manual" | "uf_percent",
      },
    })),
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
    insumosEmbalagem: ((insumos.data ?? []) as Array<{
      id: string;
      nome: string;
      embalagem: boolean | null;
      mao_de_obra: boolean | null;
      papel: PapelNoKit | null;
    }>).map((i) => ({
      id: i.id,
      nome: i.nome,
      // Sempre nulo: o preço do insumo não trafega para a tela. O custo de cada
      // linha de embalagem vem do servidor, por `custo_embalagem_kit`.
      precoSemImposto: null,
      maoDeObra: i.mao_de_obra ?? false,
      embalagem: i.embalagem ?? false,
      papel: i.papel ?? null,
    })),
    kitPorAssinatura,
    kitsParaCopiar,
    transportadoras: (transp.data ?? []).map((t) => ({
      id: t.id as string,
      nome: t.name as string,
      pedeNome: (t.requires_name as boolean | null) ?? false,
    })),
    modosPagamento: (pagamento.data ?? []).map((p) => ({
      id: p.id as string,
      label: p.label as string,
    })),
  };
}

// Catálogo no formato que o montador de kit espera (custo por produto, preço
// dos insumos de embalagem e as assinaturas já cadastradas). Fica aqui, e não
// na tela, porque três lugares precisam dele: o simulador, a pré-visualização
// de quem aprova e o fechamento.
export function montarCatalogoDeKit(
  ctx: ContextoSimulador,
  custoEmbalagemPorChave?: Map<string, string | null>
): CatalogoParaKit {
  return {
    custoEmbalagemPorChave,
    custoPorProduto: new Map<string, CustoProdutoKit>(
      ctx.produtos.filter((p) => p.cmv !== null).map((p) => [p.id, { cmv: p.cmv as string }])
    ),
    insumoPorId: new Map(
      ctx.insumosEmbalagem.map((i) => [
        i.id,
        { nome: i.nome, precoSemImposto: i.precoSemImposto, maoDeObra: i.maoDeObra },
      ])
    ),
    kitPorAssinatura: ctx.kitPorAssinatura,
  };
}

// Custo de cada linha de embalagem, calculado no BANCO.
//
// O preço do insumo não trafega para a tela: `inputs` é fechada ao Comercial
// por decisão de acesso, e mesmo para quem pode ler seria uma segunda
// implementação da mesma regra. Aqui entra a composição, sai o custo.
export async function custosDeEmbalagem(
  linhas: EmbalagemDoKit[]
): Promise<Map<string, string | null>> {
  const mapa = new Map<string, string | null>();
  if (linhas.length === 0) return mapa;
  const { data, error } = await supabase.rpc("custo_embalagem_kit", {
    p_linhas: linhas.map((e) => ({
      input_id: e.insumoId,
      quantity_type: e.modo === "itensPorCaixa" ? "lot" : "direct",
      quantity: e.modo === "porKit" ? Number(e.quantidade) : null,
      lot_size: e.modo === "itensPorCaixa" ? Number(e.quantidade) : null,
    })),
  });
  if (error) throw error;
  const saida = (data ?? []) as Array<{ custo: string | null }>;
  linhas.forEach((e, i) => mapa.set(chaveDaEmbalagem(e), saida[i]?.custo ?? null));
  return mapa;
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
  clienteNovoCodigo: string | null;
  clienteNovoNome: string | null;
  uf: string;
  vendedorId: string;
  channelId: string;
  frete: string;
  fretePorContaCliente: boolean;
  comissao: string; // fração efetivamente usada
  // DIFAL: fração efetivamente usada (05/08/2026) — igual à comissão acima,
  // já resolvida (override do pedido ou padrão do canal). Ver
  // Calculations.md §12: devido pela Intertech quando o cliente é não
  // contribuinte; contribuinte não gera DIFAL.
  aplicaDifal: boolean;
  itens: ItemSimulacao[];
  // Expedição e condições do formulário de pedido (05/08/2026). Nada aqui
  // entra em cálculo: é o que a expedição lê para despachar e o financeiro
  // lê para cobrar.
  transportadoraId: string | null;
  transportadoraOutra: string | null;
  fretesCotados: FreteCotado[];
  pesoKg: string | null;
  volumes: string | null;
  cepEntrega: string | null;
  modoPagamentoId: string | null;
  prazoPagamentoDias: string | null;
  observacao: string | null;
};

// Reexportados para quem já importava daqui.
export type { FreteCotado } from "../format";
export { normalizarFreteCotado } from "../format";

// Salva a cotação e EMPILHA UMA VERSÃO (reunião 16/07/2026: "se ele faz 10
// alterações, vamos registrar as 10"). Snapshots financeiros continuam sendo
// gravados só no fechamento (D7).
//
// Passe `orderId` para revisar uma cotação existente; null cria uma nova.
export type ResultadoCotacao = { id: string; version: number; quote_number: string; order_number: string | null };

// Campo numérico vazio vira string vazia, que a função do banco trata como
// nulo. Vírgula decimal do teclado brasileiro entra aqui: "12,5" é 12.5.
function textoOuVazio(valor: unknown): string {
  return valor == null ? "" : String(valor);
}

function numeroOuVazio(valor: unknown): string {
  return numeroDigitado(textoOuVazio(valor));
}

// Cidade e UF de entrega não passam pelo `save_quote_revision`: aquela RPC
// escreve o que entra em cálculo, e endereço de entrega não entra. Vão pelo
// mesmo caminho direto que as cotações de frete já usam — o gatilho do pedido
// fechado libera as duas colunas junto com o resto da expedição.
export async function salvarCidadeDeEntrega(
  orderId: string,
  cidade: string | null,
  uf: string | null
): Promise<void> {
  const { error } = await supabase
    .from("orders")
    .update({
      shipping_city: cidade?.trim() || null,
      shipping_state: uf?.trim().toUpperCase() || null,
    })
    .eq("id", orderId);
  if (error) throw error;
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
      customer_external_code: textoOuVazio(d.clienteNovoCodigo).trim().toUpperCase() || null,
      customer_name: textoOuVazio(d.clienteNovoNome).trim() || null,
      uf: d.uf,
      seller_id: d.vendedorId,
      channel_id: d.channelId,
      freight: numeroOuVazio(d.frete),
      freight_paid_by_customer: d.fretePorContaCliente,
      commission_rate: d.comissao,
      applies_difal: d.aplicaDifal,
      carrier_id: d.transportadoraId,
      carrier_other: d.transportadoraOutra,
      weight_kg: numeroOuVazio(d.pesoKg),
      volumes: numeroOuVazio(d.volumes),
      shipping_zip: d.cepEntrega,
      payment_term_id: d.modoPagamentoId,
      payment_term_days: numeroOuVazio(d.prazoPagamentoDias),
      order_notes: d.observacao,
    },
    p_items: d.itens.map((i) => ({
      product_id: i.tipo === "produto" ? i.refId : null,
      kit_id: i.tipo === "kit" ? i.refId : null,
      quantity: numeroOuVazio(i.quantidade),
      unit_price: numeroOuVazio(i.precoVenda),
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
  const resultado = data as ResultadoCotacao;
  // Normaliza o valor e o prazo antes de gravar: eles vêm do que a pessoa
  // digitou ("384,00", "3.223,00") e ficam num jsonb, sem o `numeric` do banco
  // para arrumar. Gravando cru, a ficha de expedição não conseguia formatar e
  // mostrava "—" no lugar do valor cotado (relatado em 21/08/2026).
  const { error: erroFretes } = await supabase
    .from("orders")
    .update({ freight_quotes: d.fretesCotados.map(normalizarFreteCotado) })
    .eq("id", resultado.id);
  if (erroFretes) throw erroFretes;
  const { data: numeros, error: erroNumeros } = await supabase
    .from("orders")
    .select("quote_number, order_number")
    .eq("id", resultado.id)
    .single();
  if (erroNumeros) throw erroNumeros;
  const codigoCliente = textoOuVazio(d.clienteNovoCodigo).trim().toUpperCase();
  if (!d.clienteId && codigoCliente) {
    const { error: erroCodigo } = await supabase.rpc("set_order_customer_external_code", {
      p_order_id: resultado.id,
      p_external_code: codigoCliente,
    });
    if (erroCodigo) throw erroCodigo;
  }
  return {
    ...resultado,
    quote_number: (numeros?.quote_number as string | null) ?? resultado.quote_number,
    order_number: (numeros?.order_number as string | null) ?? resultado.order_number ?? null,
  };
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

export type ModoPagamentoOpcao = { id: string; label: string };

export async function listarModosPagamento(): Promise<ModoPagamentoOpcao[]> {
  const { data, error } = await supabase
    .from("payment_terms")
    .select("id, label")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as ModoPagamentoOpcao[];
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
  profiles: { full_name: string | null } | Array<{ full_name: string | null }> | null;
};

export async function listarVersoes(orderId: string): Promise<VersaoCotacao[]> {
  const { data, error } = await supabase
    .from("order_versions")
    .select("version, snapshot, created_at, profiles(full_name)")
    .eq("order_id", orderId)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as VersaoCotacao[];
}
