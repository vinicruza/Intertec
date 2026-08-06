import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErroCalculoBloqueante, toMoney } from "@calc";
import { simular, statusMargem } from "../lib/sim/params";
import { type ModoEmbalagem } from "../lib/sim/kitNoPedido";
import {
  KIT_NOVO,
  kitNovoAPartirDe,
  kitsSemNome,
  montarItensDaCotacao,
  montarItensParaMotor,
  nomeSugeridoParaKit,
  resolverLinhaDoPedido,
  resumoDoKit,
  type KitNovoEdicao,
  type LinhaItem,
  type LinhaResolvida,
} from "../lib/sim/itensDoPedido";
import {
  carregarContextoSimulador,
  montarCatalogoDeKit,
  salvarCotacao,
  type ContextoSimulador,
} from "../lib/db/pedidos";
import { obterPedidoCompleto } from "../lib/db/fechamento";
import { podeVerCascataOperacional } from "../lib/db/aprovacao";
import { useAuth } from "../auth/AuthProvider";
import {
  fracaoParaPercentual,
  interpretacaoDoNumero,
  numeroDigitado,
  percentual,
  percentualParaFracao,
  reais,
} from "../lib/format";
import { formatarCep } from "../../lib/cadastro/documentos";
import { Badge, Button, Card, Input, Label } from "@components/ui/primitives";
import { EscolhaComBusca, type OpcaoDeBusca } from "@components/ui/EscolhaComBusca";

// O montador de kit dentro do pedido, a resolução de cada linha e a montagem
// dos itens vivem em lib/sim/itensDoPedido.ts — regra do projeto: nada de
// cálculo dentro de componente de tela, e o que fica na tela não é testável.

const LINHA_VAZIA: LinhaItem = { itemId: "", quantidade: "1", preco: "", kitNovo: null };

const CORES: Record<string, string> = {
  green: "bg-green-100 text-green-800",
  yellow: "bg-yellow-100 text-yellow-800",
  orange: "bg-orange-100 text-orange-800",
  red: "bg-red-100 text-red-800",
};

function textoDeCampo(valor: unknown, padrao = ""): string {
  if (valor === null || valor === undefined) return padrao;
  return String(valor);
}

export default function SimuladorPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { perfil } = useAuth();
  // Presença de :id na URL = reabrir um pedido em aberto para editar, em vez
  // de montar um novo do zero (05/08/2026 — antes não existia NENHUM caminho
  // de volta ao Simulador depois de sair dele, nem para o pedido criado por
  // "Duplicar como nova simulação").
  const { id: idParaEditar } = useParams();
  const pedidoQuery = useQuery({
    queryKey: ["pedidoParaEditar", idParaEditar],
    queryFn: () => obterPedidoCompleto(idParaEditar!),
    enabled: Boolean(idParaEditar),
  });
  const ctxQuery = useQuery({ queryKey: ["ctxSimulador"], queryFn: carregarContextoSimulador });
  const verNumeros = podeVerCascataOperacional(perfil?.perfil);

  const [vendedorId, setVendedorId] = useState("");
  const [uf, setUf] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [clienteNovo, setClienteNovo] = useState("");
  const [comissao, setComissao] = useState<string | null>(null); // null = padrão do canal
  const [frete, setFrete] = useState("0");
  const [freteCliente, setFreteCliente] = useState(false);
  // DIFAL (05/08/2026): padrão do canal, com override por pedido — o mesmo
  // vendedor vende tanto para contribuinte (sem DIFAL) quanto para não
  // contribuinte (com DIFAL), então precisa poder trocar pedido a pedido.
  // null = usa o padrão do canal.
  const [aplicaDifalOverride, setAplicaDifalOverride] = useState<boolean | null>(null);
  const [linhas, setLinhas] = useState<LinhaItem[]>([LINHA_VAZIA]);
  // Expedição e condições do formulário de pedido (05/08/2026). Nada disso
  // entra na cascata: é o que a expedição lê para despachar e o financeiro
  // lê para cobrar. Peso e volume podem ficar em branco aqui e ser
  // preenchidos depois, na hora de embalar.
  const [transportadoraId, setTransportadoraId] = useState("");
  const [transportadoraOutra, setTransportadoraOutra] = useState("");
  const [pesoKg, setPesoKg] = useState("");
  const [volumes, setVolumes] = useState("");
  const [cepEntrega, setCepEntrega] = useState("");
  const [prazoPagamento, setPrazoPagamento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [cotacaoId, setCotacaoId] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<{ quote_number: string; version: number } | null>(null);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  // Trava para o formulário ser preenchido uma vez só quando o pedido chega —
  // sem isto, todo refetch (ex.: ao voltar de outra aba) apagaria o que a
  // pessoa estava digitando.
  const [carregado, setCarregado] = useState(false);

  const ctx = ctxQuery.data;
  const pedidoParaEditar = pedidoQuery.data;
  // Só pedido em aberto pode ser reaberto — o banco recusa o resto (D7:
  // fechado é imutável; e enquanto aguarda ou já tem decisão de aprovação,
  // editar por baixo invalidaria silenciosamente o que foi decidido).
  const editavel =
    !pedidoParaEditar
      ? true
      : pedidoParaEditar.status === "simulation" &&
        !pedidoParaEditar.cancelled_at &&
        (pedidoParaEditar.approval_status === "rascunho" || pedidoParaEditar.approval_status === "recusado");

  useEffect(() => {
    if (!idParaEditar || !pedidoParaEditar || !ctx || carregado) return;
    setCarregado(true);
    if (!editavel) return; // mostra o aviso, não preenche um formulário que não vai salvar

    const p = pedidoParaEditar;
    setCotacaoId(p.id);
    setVendedorId(textoDeCampo(p.seller_id));
    setUf(textoDeCampo(p.uf));
    setClienteId(textoDeCampo(p.customer_id));
    setComissao(p.commission_rate == null ? null : textoDeCampo(p.commission_rate));
    setFrete(textoDeCampo(p.freight, "0"));
    setFreteCliente(p.freight_paid_by_customer);
    setAplicaDifalOverride(p.applies_difal);
    setTransportadoraId(textoDeCampo(p.carrier_id));
    setTransportadoraOutra(textoDeCampo(p.carrier_other));
    setPesoKg(textoDeCampo(p.weight_kg));
    setVolumes(textoDeCampo(p.volumes));
    setCepEntrega(textoDeCampo(p.shipping_zip));
    setPrazoPagamento(textoDeCampo(p.payment_term_days));
    setObservacao(textoDeCampo(p.order_notes));

    const linhasCarregadas: LinhaItem[] = p.itens.map((item) => {
      if (item.product_id || item.kit_id) {
        return {
          itemId: (item.product_id ?? item.kit_id) as string,
          quantidade: textoDeCampo(item.quantity, "1"),
          preco: textoDeCampo(item.unit_price),
          kitNovo: null,
        };
      }
      // Kit montado no próprio pedido, ainda sem código de catálogo — volta
      // para o montador exatamente como foi deixado.
      return {
        itemId: KIT_NOVO,
        quantidade: textoDeCampo(item.quantity, "1"),
        preco: textoDeCampo(item.unit_price),
        kitNovo: {
          rotulo: textoDeCampo(item.ad_hoc_kit_label),
          produtos: (item.ad_hoc_kit_composition ?? []).map((c) => ({
            produtoId: c.product_id,
            quantidade: textoDeCampo(c.quantity, "1"),
          })),
          embalagem: (item.ad_hoc_kit_packaging ?? []).map((e) => ({
            insumoId: e.input_id,
            modo: (e.quantity_type === "lot" ? "itensPorCaixa" : "porKit") as ModoEmbalagem,
            quantidade: textoDeCampo(e.quantity_type === "lot" ? e.lot_size : e.quantity, "1"),
          })),
        },
      };
    });
    setLinhas(linhasCarregadas.length > 0 ? linhasCarregadas : [LINHA_VAZIA]);
  }, [idParaEditar, pedidoParaEditar, ctx, carregado, editavel]);

  const podeEscolherVendedor = perfil?.perfil === "admin";
  const podeEditarComissao = perfil?.perfil === "admin";
  // Comercial lança pedido só em nome próprio. Administrador lança por
  // qualquer vendedor. A tela esconde a escolha para não sugerir uma permissão
  // que não existe; a trava definitiva fica no banco.
  const soMeuVendedor = perfil?.perfil === "comercial";
  const vendedoresDisponiveis = useMemo(() => {
    if (!ctx) return [];
    if (podeEscolherVendedor) return ctx.vendedores;
    if (!soMeuVendedor) return [];
    return ctx.vendedores.filter((v) => v.id === ctx.meuVendedorId);
  }, [ctx, podeEscolherVendedor, soMeuVendedor]);
  const vendedorIdEfetivo = vendedorId || (soMeuVendedor ? ctx?.meuVendedorId ?? "" : "");
  const vendedor = ctx?.vendedores.find((v) => v.id === vendedorIdEfetivo) ?? null;

  // Com um vendedor só na lista, escolher é burocracia: já vem selecionado.
  useEffect(() => {
    if (vendedoresDisponiveis.length === 1 && !vendedorId) {
      setVendedorId(vendedoresDisponiveis[0].id);
    }
  }, [vendedoresDisponiveis, vendedorId]);

  useEffect(() => {
    if (uf || !ctx || !clienteId) return;
    const ufDoCliente = ctx.clientes.find((c) => c.id === clienteId)?.uf;
    if (ufDoCliente && ctx.tabelaPorUF.has(ufDoCliente)) setUf(ufDoCliente);
  }, [ctx, clienteId, uf]);

  const catalogo = useMemo(() => (ctx ? montarCatalogoDeKit(ctx) : null), [ctx]);

  // Opções de busca das duas listas grandes: os itens vendáveis (produtos +
  // kits) e os produtos que entram dentro de um kit.
  const opcoesDeItem: OpcaoDeBusca[] = useMemo(
    () =>
      (ctx?.itens ?? []).map((i) => ({
        id: i.id,
        codigo: i.codigo,
        nome: i.nome,
        detalhe: i.cmvUnitario === null ? "sem custo vigente" : undefined,
      })),
    [ctx]
  );

  // Cada linha resolvida uma vez só: nome, CMV e detecção de kit já existente.
  const resolvidas = useMemo(
    () => (ctx && catalogo ? linhas.map((l) => resolverLinhaDoPedido(l, ctx.itens, catalogo)) : []),
    [ctx, catalogo, linhas]
  );

  // Simulação ao vivo: monta os itens e chama o motor. Erro bloqueante (CMV
  // zerado, item sem custo) aparece como erro — nunca zero silencioso.
  const simulacao = useMemo(() => {
    if (!ctx || !vendedor || !uf) return { estado: "incompleto" as const };
    const tabela = ctx.tabelaPorUF.get(uf);
    if (!tabela) return { estado: "incompleto" as const };
    const preparados = montarItensParaMotor(linhas, resolvidas);
    if (preparados.estado !== "ok") return preparados;

    try {
      const s = simular({
        itens: preparados.itens,
        freteManual: numeroDigitado(frete) || "0",
        fretePorContaCliente: freteCliente,
        comissao: comissao ? numeroDigitado(comissao) : null,
        aplicaDifal: aplicaDifalOverride,
        canal: vendedor.regras,
        uf: tabela,
      });
      return { estado: "ok" as const, ...s };
    } catch (e) {
      if (e instanceof ErroCalculoBloqueante) return { estado: "bloqueado" as const, msg: e.message };
      return { estado: "bloqueado" as const, msg: "Não foi possível calcular." };
    }
  }, [ctx, vendedor, uf, linhas, resolvidas, frete, freteCliente, comissao, aplicaDifalOverride]);

  // Kit sem nome não é salvo: sem ele, o kit entra no catálogo como "Kit do
  // pedido" e, alguns pedidos depois, ninguém sabe qual é qual.
  const linhasComKitSemNome = kitsSemNome(linhas);

  const salvar = useMutation({
    mutationFn: async () => {
      if (simulacao.estado !== "ok" || !vendedor || !ctx) throw new Error("Cotação incompleta.");
      if (linhasComKitSemNome.length > 0) {
        throw new Error(
          `Dê um nome ao kit montado no item ${linhasComKitSemNome.map((i) => i + 1).join(", ")} antes de salvar.`
        );
      }

      const itens = montarItensDaCotacao(linhas, resolvidas, ctx.itens);

      // A foto da cotação vai junto na versão, para a análise do que não vingou.
      const foto = {
        registrado_em: new Date().toISOString(),
        uf,
        itens: itens.map((i) => ({ tipo: i.tipo, quantidade: i.quantidade, preco: i.precoVenda, rotulo: i.kitNovo?.rotulo })),
        receita_bruta: simulacao.resultado.receitaBruta.toString(),
        cmv_total: simulacao.resultado.cmvTotal.toString(),
        margem_contribuicao: simulacao.resultado.margemContribuicao.toString(),
        margem_contribuicao_pct: simulacao.resultado.margemContribuicaoPct.toString(),
      };

      return salvarCotacao(cotacaoId, {
        clienteId: clienteId || null,
        clienteNovoNome: clienteId ? null : clienteNovo,
        uf,
        vendedorId: vendedor.id,
        channelId: vendedor.channel_id,
        frete: simulacao.freteUsado.toString(),
        fretePorContaCliente: freteCliente,
        comissao: simulacao.comissaoUsada.toString(),
        aplicaDifal: simulacao.aplicaDifalUsado,
        itens,
        transportadoraId: transportadoraId || null,
        transportadoraOutra: transportadoraPedeNome ? transportadoraOutra : null,
        pesoKg,
        volumes,
        cepEntrega,
        prazoPagamentoDias: prazoPagamento,
        observacao,
      }, foto);
    },
    onSuccess: (r) => {
      setCotacaoId(r.id);
      setSalvo({ quote_number: r.quote_number, version: r.version });
      setErroSalvar(null);
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      queryClient.invalidateQueries({ queryKey: ["ctxSimulador"] });
      // Estava editando um pedido existente: o detalhe (e, se voltou a
      // rascunho após recusado, a decisão de aprovação) precisa refletir a
      // versão nova assim que a pessoa voltar para lá.
      queryClient.invalidateQueries({ queryKey: ["pedido", r.id] });
      queryClient.invalidateQueries({ queryKey: ["pedidoParaEditar", r.id] });
      queryClient.invalidateQueries({ queryKey: ["cascataVigente", r.id] });
      queryClient.invalidateQueries({ queryKey: ["versoes", r.id] });
    },
    onError: (e: unknown) => setErroSalvar(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  if (ctxQuery.isLoading || (idParaEditar && pedidoQuery.isLoading)) {
    return <p className="text-[var(--cor-texto-suave)]">Carregando…</p>;
  }
  if (!ctx) return <p className="text-red-600">Erro ao carregar o simulador.</p>;
  if (idParaEditar && !pedidoParaEditar) return <p className="text-red-600">Pedido não encontrado.</p>;
  if (idParaEditar && pedidoParaEditar && !editavel) {
    const motivo = pedidoParaEditar.cancelled_at
      ? "está cancelado"
      : pedidoParaEditar.status !== "simulation"
        ? "já foi fechado"
        : pedidoParaEditar.approval_status === "pendente"
          ? "está aguardando aprovação"
          : "já foi aprovado";
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <p className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-900">
          Este pedido {motivo} — não é mais possível editar os itens ou valores por aqui.
          {pedidoParaEditar.approval_status === "pendente" &&
            " Se precisar mudar algo, peça para recusarem a aprovação primeiro; ao editar de novo, o pedido volta para rascunho."}
        </p>
        <Button onClick={() => navigate(`/pedidos/${pedidoParaEditar.id}`)}>Voltar ao pedido</Button>
      </div>
    );
  }

  function atualizarLinha(i: number, campo: "itemId" | "quantidade" | "preco", valor: string) {
    setLinhas((a) =>
      a.map((l, idx) => {
        if (idx !== i) return l;
        if (campo === "itemId") {
          // Escolher "montar kit novo" abre o montador embutido; sair dele limpa.
          return {
            ...l,
            itemId: valor,
            kitNovo:
              valor === KIT_NOVO
                ? l.kitNovo ?? { rotulo: "", produtos: [{ produtoId: "", quantidade: "1" }], embalagem: [] }
                : null,
          };
        }
        return { ...l, [campo]: valor };
      })
    );
    setSalvo(null);
  }

  function atualizarKitNovo(i: number, muda: (k: KitNovoEdicao) => KitNovoEdicao) {
    setLinhas((a) => a.map((l, idx) => (idx === i && l.kitNovo ? { ...l, kitNovo: muda(l.kitNovo) } : l)));
    setSalvo(null);
  }

  // Acima de 20% não é comissão, é engano de digitação (o maior canal hoje é
  // Externos, com 6,1%). Avisa em vez de bloquear: casos fora da curva
  // existem, e quem decide é quem aprova.
  const comissaoForaDoNormal = comissao !== null && Number(comissao) > 0.2;

  const freteAutomatico = vendedor?.regras.modeloFrete === "uf_percent";
  const transportadora = ctx.transportadoras.find((t) => t.id === transportadoraId) ?? null;
  const transportadoraPedeNome = transportadora?.pedeNome ?? false;
  const clienteEscolhido = ctx.clientes.find((c) => c.id === clienteId) ?? null;
  // O que falta no cadastro do cliente para a ficha sair completa. Avisar
  // aqui, e não na hora de imprimir, é o que dá tempo de resolver antes de o
  // papel chegar à mesa da conferência.
  const faltaNoCadastro = clienteEscolhido
    ? ([
        !clienteEscolhido.tax_id && "CNPJ/CPF",
        !clienteEscolhido.billing_zip && "CEP de faturamento",
        !clienteEscolhido.shipping_zip && "CEP de entrega",
        !clienteEscolhido.contact_name && "contato",
        !clienteEscolhido.phone && "telefone",
      ].filter(Boolean) as string[])
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {pedidoParaEditar ? `Editando pedido ${pedidoParaEditar.quote_number ?? ""}` : "Simulador de pedido"}
        </h1>
        {pedidoParaEditar && (
          <Button
            className="bg-transparent text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)]"
            onClick={() => navigate(`/pedidos/${pedidoParaEditar.id}`)}
          >
            Voltar ao pedido
          </Button>
        )}
      </div>

      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {podeEscolherVendedor && (
            <div>
              <Label>Vendedor</Label>
              <select
                className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
                value={vendedorId}
                onChange={(e) => { setVendedorId(e.target.value); setComissao(null); setAplicaDifalOverride(null); }}
              >
                <option value="">Selecione…</option>
                {vendedoresDisponiveis.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} — {v.canalNome}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label>UF de destino</Label>
            <select className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={uf} onChange={(e) => setUf(e.target.value)}>
              <option value="">—</option>
              {ctx.ufs.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <Label>Cliente</Label>
            <select className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Novo cliente…</option>
              {ctx.clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {!clienteId && (
            <div>
              <Label>Nome do novo cliente</Label>
              <Input value={clienteNovo} onChange={(e) => setClienteNovo(e.target.value)} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            {/* Em porcentagem, não em fração: pedir 0,025 é pedir para alguém
                digitar 0,25 achando que são 2,5% — e 25% de comissão passaria
                sem aviso nenhum. */}
            <Label>Comissão (%)</Label>
            <div className="flex items-center gap-1">
              <Input
                value={fracaoParaPercentual(comissao ?? vendedor?.regras.comissaoPadrao ?? "")}
                onChange={(e) => {
                  if (podeEditarComissao) setComissao(percentualParaFracao(e.target.value));
                }}
                disabled={!podeEditarComissao}
                placeholder="ex.: 2,5"
              />
              <span className="text-sm text-[var(--cor-texto-suave)]">%</span>
            </div>
            {podeEditarComissao && vendedor && comissao !== null && comissao !== vendedor.regras.comissaoPadrao && (
              <p className="mt-1 text-xs text-amber-700">
                Diferente do padrão do canal ({fracaoParaPercentual(vendedor.regras.comissaoPadrao)}%) —
                registrado em auditoria ao fechar.
              </p>
            )}
            {podeEditarComissao && comissaoForaDoNormal && (
              <p className="mt-1 text-xs font-medium text-red-700">
                ⚠️ {fracaoParaPercentual(comissao)}% de comissão está muito acima do normal — confira
                se não digitou a fração no lugar da porcentagem.
              </p>
            )}
          </div>
          <div>
            <Label>Frete (R$)</Label>
            {/* Frete por conta do cliente: o campo é bloqueado e vale 0. Nada de
                digitar um valor que o sistema depois ignora — ou pior, desconta. */}
            {freteCliente ? (
              <p className="rounded-md bg-[var(--cor-fundo)] px-3 py-2 text-sm text-[var(--cor-texto-suave)]">
                R$ 0,00 — por conta do cliente
              </p>
            ) : freteAutomatico ? (
              <p className="rounded-md bg-[var(--cor-fundo)] px-3 py-2 text-sm">
                {simulacao.estado === "ok" ? reais(simulacao.freteUsado.toString()) : "—"} (automático: % da receita por UF)
              </p>
            ) : (
              <Input value={frete} onChange={(e) => setFrete(e.target.value)} />
            )}
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={freteCliente}
              onChange={(e) => {
                setFreteCliente(e.target.checked);
                if (e.target.checked) setFrete("0");
              }}
            />
            Frete por conta do cliente
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={aplicaDifalOverride ?? vendedor?.regras.aplicaDifal ?? true}
              onChange={(e) => setAplicaDifalOverride(e.target.checked)}
            />
            Aplica DIFAL neste pedido
          </label>
        </div>

        {/* DIFAL: devido pela Intertech quando o cliente é NÃO CONTRIBUINTE
            (consumidor final); contribuinte não gera DIFAL — confirmado com a
            Intertech em 05/08/2026 (Calculations.md §12). O canal já vem com
            um padrão, mas o mesmo vendedor pode vender para os dois tipos de
            cliente, então a caixa acima decide pedido a pedido. */}
        {vendedor && (aplicaDifalOverride ?? vendedor.regras.aplicaDifal) !== vendedor.regras.aplicaDifal && (
          <p className="text-xs text-amber-700">
            Diferente do padrão do canal ({vendedor.regras.aplicaDifal ? "aplica" : "não aplica"} DIFAL) —
            registrado no pedido.
          </p>
        )}

        {/* Cadastro incompleto não impede de cotar — impede de imprimir uma
            ficha completa. O aviso aparece cedo, com o caminho para resolver. */}
        {faltaNoCadastro.length > 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            O cadastro de <strong>{clienteEscolhido?.name}</strong> está sem{" "}
            {faltaNoCadastro.join(", ")}. A ficha do pedido vai sair com o cabeçalho incompleto.{" "}
            <Link to={`/clientes/${clienteEscolhido?.id}`} className="font-semibold underline">
              Completar o cadastro
            </Link>
          </p>
        )}
      </Card>

      {/* ------------------------------------------------------------------
          Expedição e condições — o bloco de baixo do formulário de papel.
          Nenhum destes campos entra na cascata de margem.
          ------------------------------------------------------------------ */}
      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Expedição e condições</h2>
          <p className="text-sm text-[var(--cor-texto-suave)]">
            O que a expedição precisa para despachar e o financeiro para cobrar. Peso e volume
            podem ficar em branco agora e ser preenchidos na hora de embalar, na tela do pedido.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <Label>Transportadora</Label>
            <select
              className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
              value={transportadoraId}
              onChange={(e) => setTransportadoraId(e.target.value)}
            >
              <option value="">—</option>
              {ctx.transportadoras.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>
          {transportadoraPedeNome && (
            <div>
              <Label>Qual transportadora</Label>
              <Input
                value={transportadoraOutra}
                onChange={(e) => setTransportadoraOutra(e.target.value)}
                placeholder="Nome da transportadora"
              />
            </div>
          )}
          <div>
            <Label>Peso (kg)</Label>
            <Input value={pesoKg} onChange={(e) => setPesoKg(e.target.value)} placeholder="ex.: 12,5" />
          </div>
          <div>
            <Label>Volumes</Label>
            <Input value={volumes} onChange={(e) => setVolumes(e.target.value)} placeholder="ex.: 3" />
          </div>
          <div>
            <Label>Pagamento (dias)</Label>
            <Input
              value={prazoPagamento}
              onChange={(e) => setPrazoPagamento(e.target.value)}
              placeholder="ex.: 30"
            />
          </div>
          <div>
            <Label>CEP de entrega</Label>
            <Input
              value={cepEntrega}
              onChange={(e) => setCepEntrega(e.target.value)}
              placeholder={
                clienteEscolhido?.shipping_zip
                  ? formatarCep(clienteEscolhido.shipping_zip)
                  : "00000-000"
              }
            />
            {/* Só se digita aqui quando a entrega foge do endereço de sempre.
                Em branco, vale o do cadastro — e o cadastro não é alterado. */}
            <p className="mt-1 text-xs text-[var(--cor-texto-suave)]">
              {clienteEscolhido?.shipping_zip
                ? "Em branco, vale o do cadastro do cliente."
                : "O cliente não tem CEP de entrega no cadastro."}
            </p>
          </div>
        </div>
        <div>
          <Label>Observação</Label>
          <textarea
            className="w-full rounded-[0.625rem] border border-[var(--cor-borda)] bg-white px-3 py-2 text-sm"
            rows={2}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Sai impressa na ficha do pedido."
          />
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Itens</h2>
          <Button type="button" onClick={() => setLinhas((a) => [...a, LINHA_VAZIA])}>
            Adicionar item
          </Button>
        </div>
        {linhas.map((l, i) => {
          const r = resolvidas[i];
          return (
            <div key={i} className="space-y-2 rounded-md border border-[var(--cor-borda)] p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-72 flex-1">
                <Label>Produto ou kit</Label>
                {/* Montar um kit novo é uma AÇÃO, não um item de catálogo —
                    ficava escondida como primeira opção de uma lista de 324
                    produtos. Agora é um botão ao lado, e o campo é só busca. */}
                {l.itemId === KIT_NOVO ? (
                  <div className="flex min-h-10 items-center gap-2 rounded-[0.625rem] border border-dashed border-[var(--cor-primaria)] bg-[var(--cor-primaria-clara)] px-3 text-sm">
                    <Badge>Kit montado neste pedido</Badge>
                    <button
                      type="button"
                      className="text-xs text-[var(--cor-texto-suave)] underline"
                      onClick={() => atualizarLinha(i, "itemId", "")}
                    >
                      escolher um item do catálogo
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <EscolhaComBusca
                      valor={l.itemId}
                      opcoes={opcoesDeItem}
                      aoEscolher={(id) => atualizarLinha(i, "itemId", id)}
                      placeholder="Digite o código ou o nome…"
                    />
                    <button
                      type="button"
                      className="shrink-0 text-xs font-medium text-[var(--cor-primaria)] hover:underline"
                      onClick={() => atualizarLinha(i, "itemId", KIT_NOVO)}
                    >
                      ➕ montar kit
                    </button>
                  </div>
                )}
              </div>
              <div>
                <Label>{l.itemId === KIT_NOVO ? "Quantidade de kits" : "Quantidade"}</Label>
                <Input className="w-28" value={l.quantidade} onChange={(e) => atualizarLinha(i, "quantidade", e.target.value)} />
                <AvisoDeNumero valor={l.quantidade} />
              </div>
              <div>
                <Label>{l.itemId === KIT_NOVO ? "Preço por kit" : "Preço de venda"}</Label>
                <Input className="w-28" value={l.preco} onChange={(e) => atualizarLinha(i, "preco", e.target.value)} />
                <AvisoDeNumero valor={l.preco} />
              </div>
              <div className="pb-2 text-xs text-[var(--cor-texto-suave)]">
                {r && !r.erro && (r.cmvUnitario
                  ? (verNumeros ? <>CMV un.: {reais(r.cmvUnitario)}</> : null)
                  : <span className="text-red-600">sem custo vigente (bloqueante)</span>)}
              </div>
              <button type="button" className="pb-2 text-xs text-red-600 hover:underline" onClick={() => setLinhas((a) => a.filter((_, idx) => idx !== i))}>
                Remover
              </button>
            </div>

            {l.itemId === KIT_NOVO && l.kitNovo && (
              <MontadorKit
                ctx={ctx}
                kit={l.kitNovo}
                quantidadeVendida={l.quantidade}
                resolvida={r}
                verNumeros={verNumeros}
                aoMudar={(muda) => atualizarKitNovo(i, muda)}
              />
            )}
            </div>
          );
        })}
      </Card>

      {simulacao.estado === "bloqueado" && (
        <p className="rounded-md bg-red-50 px-3 py-3 text-sm text-red-700">🛑 {simulacao.msg}</p>
      )}

      {simulacao.estado === "ok" && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Cascata do pedido</h2>
            {(() => {
              const st = statusMargem(simulacao.resultado.margemContribuicaoPct, ctx.regrasMargem);
              return st ? (
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${CORES[st.color ?? ""] ?? "bg-gray-100 text-gray-800"}`}>
                  {st.label}
                </span>
              ) : null;
            })()}
          </div>

          {!verNumeros && (
            <p className="text-sm text-[var(--cor-texto-suave)]">
              A faixa acima indica a saúde da margem deste pedido. Os valores de custo e margem
              ficam visíveis para quem aprova.
            </p>
          )}

          {verNumeros && <table className="w-full text-sm">
            <tbody>
              <LinhaCascata rotulo="Receita bruta" valor={simulacao.resultado.receitaBruta.toString()} />
              <LinhaCascata rotulo="(−) Impostos sobre venda + DIFAL" valor={simulacao.resultado.imposto.plus(simulacao.resultado.difal).negated().toString()} />
              <LinhaCascata rotulo="= Receita líquida (após frete/comissão)" valor={simulacao.resultado.receitaLiquida.toString()} pct="100,00%" destaque />
              <LinhaCascata rotulo="(−) CMV" valor={simulacao.resultado.cmvTotal.negated().toString()} />
              <LinhaCascata
                rotulo="= MARGEM DE CONTRIBUIÇÃO (métrica oficial)"
                valor={simulacao.resultado.margemContribuicao.toString()}
                pct={percentual(simulacao.resultado.margemContribuicaoPct.toString())}
                destaque
              />
            </tbody>
          </table>}
          {verNumeros && <p className="text-xs text-[var(--cor-texto-suave)]">
            Deduções da receita líquida: frete {toMoney(simulacao.freteUsado).replace(".", ",")} · imposto frete{" "}
            {toMoney(simulacao.resultado.impostoFrete).replace(".", ",")} · comissão {toMoney(simulacao.resultado.comissao).replace(".", ",")}
            {freteCliente ? " · frete por conta do cliente (não entra no resultado)" : ""}
          </p>}

          {simulacao.avisos.map((a, i) => (
            <p key={i} className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">⚠️ {a}</p>
          ))}

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={() => salvar.mutate()}
              disabled={salvar.isPending || linhasComKitSemNome.length > 0}
              title={linhasComKitSemNome.length > 0 ? "Dê um nome ao kit montado antes de salvar." : undefined}
            >
              {salvar.isPending ? "Salvando…" : cotacaoId ? "Salvar nova versão" : "Salvar cotação"}
            </Button>
            {linhasComKitSemNome.length > 0 && (
              <span className="text-sm text-amber-700">
                Dê um nome ao kit montado no item {linhasComKitSemNome.map((i) => i + 1).join(", ")}.
              </span>
            )}
            {salvo && (
              <span className="text-sm text-green-700">
                Cotação <strong>{salvo.quote_number}</strong> salva — versão {salvo.version} ✓
              </span>
            )}
            {erroSalvar && <span className="text-sm text-red-600">{erroSalvar}</span>}
          </div>
        </Card>
      )}
    </div>
  );
}

// Montador de kit embutido no pedido. Antes eram duas telas — criar o kit e
// depois puxar o código no simulador. A reunião de 16/07/2026 inverteu: o kit
// nasce aqui, e a tela de Kits vira consulta.
function MontadorKit({
  ctx,
  kit,
  quantidadeVendida,
  resolvida,
  verNumeros,
  aoMudar,
}: {
  ctx: ContextoSimulador;
  kit: KitNovoEdicao;
  quantidadeVendida: string;
  resolvida: LinhaResolvida | null;
  verNumeros: boolean;
  aoMudar: (muda: (k: KitNovoEdicao) => KitNovoEdicao) => void;
}) {
  // Escape hatch: nem todo insumo de embalagem já foi marcado como tal na
  // tela de Insumos (é o Administrador quem marca). Sem isto, quem monta o
  // kit e não acha o insumo certo na lista filtrada ficaria travado — e
  // Comercial nem tem acesso à tela de Insumos para corrigir sozinho.
  const [mostrarTodos, setMostrarTodos] = useState(false);
  // Um insumo já escolhido nunca some da lista, mesmo filtrado: senão, tirar
  // o "mostrar todos" depois de escolher um insumo fora da marcação faria a
  // seleção sumir da tela sem avisar.
  function opcoesPara(insumoIdAtual: string): typeof ctx.insumosEmbalagem {
    if (mostrarTodos) return ctx.insumosEmbalagem;
    return ctx.insumosEmbalagem.filter((i) => i.embalagem || i.id === insumoIdAtual);
  }

  const nomePorProduto = new Map(ctx.produtos.map((p) => [p.id, p.nome]));
  const opcoesDeProduto: OpcaoDeBusca[] = ctx.produtos.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    detalhe: p.cmv === null ? "sem custo vigente" : undefined,
  }));
  const resumo = resumoDoKit(kit, quantidadeVendida, nomePorProduto);
  const sugestaoDeNome = nomeSugeridoParaKit(kit, nomePorProduto);
  const opcoesDeKitBase: OpcaoDeBusca[] = ctx.kitsParaCopiar.map((k) => ({
    id: k.id,
    codigo: k.codigo,
    nome: k.nome,
  }));

  return (
    // Recuo com barra à esquerda: o que está aqui dentro é a RECEITA de um kit,
    // não a venda. As duas quantidades ficavam a poucos centímetros uma da
    // outra, com a mesma cara — trocar 100 kits vendidos por 100 aventais
    // dentro do kit era o erro mais fácil de cometer nesta tela.
    <div className="ml-2 space-y-3 rounded-md border-l-4 border-[var(--cor-primaria)] bg-[var(--cor-fundo)] p-3 pl-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Receita de 1 kit</h3>
        <p className="text-xs text-[var(--cor-texto-suave)]">
          A quantidade e o preço lá em cima são da <strong>venda</strong>. Aqui é o que entra
          dentro de <strong>cada kit</strong>.
        </p>
      </div>

      {/* Conferência em uma frase, na língua de quem está montando. */}
      {resumo && (
        <p className="rounded-md bg-white px-3 py-2 text-sm">
          <strong>{resumo}</strong>
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Label>Como chamar este kit (uso interno)</Label>
          <Input
            value={kit.rotulo}
            placeholder={sugestaoDeNome || "ex.: Kit catarata Hospital X"}
            onChange={(e) => aoMudar((k) => ({ ...k, rotulo: e.target.value }))}
          />
          {kit.rotulo.trim() === "" && (
            <p className="mt-1 text-xs text-[var(--cor-texto-suave)]">
              Obrigatório — é por este nome que o kit vai aparecer no catálogo depois.
              {sugestaoDeNome && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="font-medium text-[var(--cor-primaria)] hover:underline"
                    onClick={() => aoMudar((k) => ({ ...k, rotulo: sugestaoDeNome }))}
                  >
                    usar a sugestão
                  </button>
                </>
              )}
            </p>
          )}
        </div>
        <p className="pb-2 text-xs text-[var(--cor-texto-suave)]">
          O código oficial só é gerado quando o pedido for ganho.
        </p>
      </div>

      {/* Partir de um kit existente: montar "o kit catarata mais uma
          compressa" obrigava a escolher tudo de novo, produto por produto. */}
      {opcoesDeKitBase.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1">
            <Label>Partir de um kit que já existe (opcional)</Label>
            <EscolhaComBusca
              valor=""
              opcoes={opcoesDeKitBase}
              placeholder="Digite o código ou o nome do kit…"
              aoEscolher={(id) => {
                const base = ctx.kitsParaCopiar.find((k) => k.id === id);
                if (base) aoMudar(() => kitNovoAPartirDe(base));
              }}
            />
          </div>
          <p className="pb-2 text-xs text-[var(--cor-texto-suave)]">
            Carrega a composição para você ajustar. Se nada mudar, o sistema avisa que aquele kit
            já existe e usa o código dele.
          </p>
        </div>
      )}

      {/* Aviso de composição já existente — pedido explícito na reunião:
          "a hora que ela jogar ali, o próprio sistema acusasse que aquele kit já existe". */}
      {resolvida?.kitExistente && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠️ Esta composição já existe: <strong>{resolvida.kitExistente.codigo}</strong>{" "}
          ({resolvida.kitExistente.nome}). Ao salvar, o pedido usará esse kit — o código é o mesmo,
          não será criado um duplicado.
          {resolvida.kitExistente.ativo === false && (
            <>
              {" "}
              <strong>Atenção:</strong> esse kit está <strong>inativo</strong> no catálogo. Ele
              continua valendo para este pedido; se isso não for o esperado, peça a um
              Administrador para reativá-lo ou mude a composição.
            </>
          )}
        </p>
      )}
      {resolvida?.erro && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">🛑 {resolvida.erro}</p>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label>Produtos do kit</Label>
            <p className="text-xs text-[var(--cor-texto-suave)]">
              Quantas unidades de cada produto entram em <strong>1 kit</strong> — não é a venda.
            </p>
          </div>
          <button
            type="button"
            className="text-xs font-medium text-[var(--cor-primaria)] hover:underline"
            onClick={() => aoMudar((k) => ({ ...k, produtos: [...k.produtos, { produtoId: "", quantidade: "1" }] }))}
          >
            + Adicionar produto
          </button>
        </div>
        {kit.produtos.length > 0 && (
          <div className="flex gap-2 px-1 text-xs text-[var(--cor-texto-suave)]">
            <span className="flex-1">Produto</span>
            <span className="w-24">Qtd. no kit</span>
          </div>
        )}
        {kit.produtos.map((p, j) => (
          <div key={j} className="flex items-end gap-2">
            <div className="flex-1">
              <EscolhaComBusca
                valor={p.produtoId}
                opcoes={opcoesDeProduto}
                placeholder="Digite o código ou o nome…"
                aoEscolher={(id) =>
                  aoMudar((k) => ({
                    ...k,
                    produtos: k.produtos.map((x, idx) => (idx === j ? { ...x, produtoId: id } : x)),
                  }))
                }
              />
            </div>
            <Input
              className="w-24"
              value={p.quantidade}
              onChange={(e) =>
                aoMudar((k) => ({
                  ...k,
                  produtos: k.produtos.map((x, idx) => (idx === j ? { ...x, quantidade: e.target.value } : x)),
                }))
              }
            />
            <button
              type="button"
              className="pb-2 text-xs text-red-600 hover:underline"
              onClick={() => aoMudar((k) => ({ ...k, produtos: k.produtos.filter((_, idx) => idx !== j) }))}
            >
              Remover
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label>Embalagem e esterilização</Label>
            <p className="text-xs text-[var(--cor-texto-suave)]">
              O envelope é <strong>um por kit</strong>. A caixa de esterilização atende vários
              kits: escolha <strong>"kits por caixa"</strong> e diga quantos kits cabem nela — o
              custo é rateado automaticamente. Não é a quantidade de caixas usadas.
            </p>
          </div>
          <button
            type="button"
            className="text-xs font-medium text-[var(--cor-primaria)] hover:underline"
            onClick={() => aoMudar((k) => ({ ...k, embalagem: [...k.embalagem, { insumoId: "", modo: "porKit", quantidade: "1" }] }))}
          >
            + Adicionar embalagem
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--cor-texto-suave)]">
          <input type="checkbox" checked={mostrarTodos} onChange={(e) => setMostrarTodos(e.target.checked)} />
          Não achei o insumo — mostrar todos os insumos do catálogo
        </label>
        {kit.embalagem.map((e, j) => (
          <div key={j} className="flex items-end gap-2">
            <select
              className="flex-1 rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
              value={e.insumoId}
              onChange={(ev) =>
                aoMudar((k) => ({
                  ...k,
                  embalagem: k.embalagem.map((x, idx) => (idx === j ? { ...x, insumoId: ev.target.value } : x)),
                }))
              }
            >
              <option value="">Selecione…</option>
              {opcoesPara(e.insumoId).map((ins) => (
                <option key={ins.id} value={ins.id}>{ins.nome}</option>
              ))}
            </select>
            <select
              className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
              value={e.modo}
              onChange={(ev) =>
                aoMudar((k) => ({
                  ...k,
                  embalagem: k.embalagem.map((x, idx) =>
                    idx === j ? { ...x, modo: ev.target.value as ModoEmbalagem } : x
                  ),
                }))
              }
            >
              <option value="porKit">un. por kit</option>
              <option value="itensPorCaixa">kits por caixa</option>
            </select>
            <div>
              <Input
                className="w-24"
                value={e.quantidade}
                onChange={(ev) =>
                  aoMudar((k) => ({
                    ...k,
                    embalagem: k.embalagem.map((x, idx) => (idx === j ? { ...x, quantidade: ev.target.value } : x)),
                  }))
                }
              />
              <span className="text-[0.65rem] text-[var(--cor-texto-suave)]">
                {e.modo === "itensPorCaixa" ? "kits por caixa" : "un. por kit"}
              </span>
            </div>
            <button
              type="button"
              className="pb-2 text-xs text-red-600 hover:underline"
              onClick={() => aoMudar((k) => ({ ...k, embalagem: k.embalagem.filter((_, idx) => idx !== j) }))}
            >
              Remover
            </button>
          </div>
        ))}
      </div>

      {verNumeros && resolvida && !resolvida.erro && resolvida.linhasProdutos.length > 0 && (
        <PesoDeCustoDoKit ctx={ctx} resolvida={resolvida} />
      )}
    </div>
  );
}

// Peso de cada produto e embalagem no custo do kit — pedido do cliente em
// 30/07/2026: "não saberemos qual produto deu maior ou menor margem em cada
// kit". Não existe preço por produto dentro do kit (o cliente negocia o kit
// inteiro, não a peça); o que existe é o custo de cada um, e isso já responde
// "qual item está pesando mais" sem inventar um preço que não existe.
function PesoDeCustoDoKit({ ctx, resolvida }: { ctx: ContextoSimulador; resolvida: LinhaResolvida }) {
  const nomeDoProduto = (produtoId: string) => ctx.produtos.find((p) => p.id === produtoId)?.nome ?? produtoId;
  const linhas = [
    ...resolvida.linhasProdutos.map((l) => ({ nome: nomeDoProduto(l.produtoId), custo: l.custo, participacao: l.participacao })),
    ...resolvida.linhasEmbalagem.map((l) => ({ nome: l.nome, custo: l.custo, participacao: l.participacao })),
  ].sort((a, b) => Number(b.participacao) - Number(a.participacao));

  return (
    <div className="space-y-1 rounded-md border border-[var(--cor-borda)] bg-white p-3">
      <Label>Peso de cada item no custo do kit</Label>
      <table className="w-full text-sm">
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-b border-[var(--cor-borda)] last:border-0">
              <td className="py-1">{l.nome}</td>
              <td className="py-1 text-right text-[var(--cor-texto-suave)]">{reais(l.custo)}</td>
              <td className="w-16 py-1 text-right font-medium">{percentual(l.participacao)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// O ponto sozinho é ambíguo ("4.20" são quatro reais e vinte; "1.000" quase
// sempre é mil). Em vez de adivinhar — e errar a quantidade de um pedido
// inteiro —, o sistema mostra o que entendeu, embaixo do campo.
function AvisoDeNumero({ valor }: { valor: string }) {
  const aviso = interpretacaoDoNumero(valor);
  if (!aviso) return null;
  return <p className="mt-1 w-28 text-[0.65rem] leading-tight text-amber-700">{aviso}</p>;
}

function LinhaCascata({ rotulo, valor, pct, destaque }: { rotulo: string; valor: string; pct?: string; destaque?: boolean }) {
  return (
    <tr className={destaque ? "font-semibold" : ""}>
      <td className="py-1">{rotulo}</td>
      <td className="py-1 text-right">{reais(valor)}</td>
      <td className="w-24 py-1 text-right text-[var(--cor-texto-suave)]">{pct ?? ""}</td>
    </tr>
  );
}
