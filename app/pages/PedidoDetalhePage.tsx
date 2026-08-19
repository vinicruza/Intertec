import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { dec } from "@calc";
import {
  calcularCascataVigente,
  cancelarPedido,
  duplicarPedido,
  fecharPedido,
  obterPedidoCompleto,
  reabrirPedido,
  salvarExpedicao,
  type DadosExpedicao,
  type FreteCotadoPedido,
  type KitMaterializado,
  type PedidoCompleto,
} from "../lib/db/fechamento";
import {
  listarMotivosPerda,
  listarModosPagamento,
  listarTransportadoras,
  listarVersoes,
  marcarCotacaoPerdida,
  reabrirCotacaoPerdida,
} from "../lib/db/pedidos";
import {
  decidirAprovacao,
  enviarParaAprovacao,
  obterParametrosAprovacao,
  podeAprovar,
  podeVerCascataOperacional,
} from "../lib/db/aprovacao";
import { seloExigeAprovacao, seloMargemComercial } from "../lib/sim/params";
import { useAuth } from "../auth/AuthProvider";
import { dataCurta, percentual, reais } from "../lib/format";
import { mensagemDeErro } from "../lib/erros";
import { cepValido, formatarCep } from "../../lib/cadastro/documentos";
import { Badge, Button, Card, Input, Label } from "@components/ui/primitives";

const FRETE_COTADO_VAZIO: FreteCotadoPedido = {
  id: "",
  carrierId: null,
  carrierName: null,
  carrierOther: null,
  amount: null,
  leadTimeDays: null,
  quoteCode: null,
  selected: false,
};

function novoFreteCotado(): FreteCotadoPedido {
  return { ...FRETE_COTADO_VAZIO, id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()) };
}

const CORES_SELO_MARGEM: Record<string, string> = {
  blue: "bg-blue-100 text-blue-800",
  green: "bg-green-100 text-green-800",
  yellow: "bg-yellow-100 text-yellow-800",
  red: "bg-red-100 text-red-800",
};

// Detalhe do pedido. Para pedido FECHADO, tudo vem do snapshot congelado —
// nada é recalculado (D7). Simulações mostram os itens e oferecem o fechamento.
export default function PedidoDetalhePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { perfil } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  // Kits que ganharam código oficial no fechamento deste pedido.
  const [kitsCriados, setKitsCriados] = useState<KitMaterializado[]>([]);
  const [cancelando, setCancelando] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [perdendo, setPerdendo] = useState(false);
  const [motivoPerdaId, setMotivoPerdaId] = useState("");
  const [observacaoPerda, setObservacaoPerda] = useState("");
  const [observacaoAprovacao, setObservacaoAprovacao] = useState("");

  const { data: pedido, isLoading } = useQuery({
    queryKey: ["pedido", id],
    queryFn: () => obterPedidoCompleto(id!),
  });

  // Enquanto o pedido não fecha, CMV e margem não existem gravados em lugar
  // nenhum (Decisão D7: só o fechamento congela o snapshot). Sem isto, quem
  // aprova veria só o preço de venda — exatamente o que o papel na pasta já
  // mostrava, e a aprovação não teria como julgar nada.
  const cascataQuery = useQuery({
    queryKey: ["cascataVigente", id],
    queryFn: () => calcularCascataVigente(id!),
    enabled: Boolean(pedido) && pedido?.status === "simulation" && pedido.itens.length > 0,
  });

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ["pedido", id] });
    queryClient.invalidateQueries({ queryKey: ["pedidos"] });
    queryClient.invalidateQueries({ queryKey: ["dreDados"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const fechar = useMutation({
    mutationFn: () => fecharPedido(id!),
    onSuccess: (kits) => {
      // O código oficial do kit nasce agora. Sem dizer qual é, quem fechou o
      // pedido teria de ir procurar na tela de Kits para descobrir.
      setKitsCriados(kits);
      recarregar();
    },
    onError: (e: unknown) => setErro(mensagemDeErro(e, "Erro ao gerar pedido.")),
  });
  const reabrir = useMutation({
    mutationFn: () => reabrirPedido(id!),
    onSuccess: (novoId) => navigate(`/pedidos/${novoId}`),
    onError: (e: unknown) => setErro(mensagemDeErro(e, "Erro ao reabrir (apenas Administrador).")),
  });
  const duplicar = useMutation({
    mutationFn: () => duplicarPedido(id!),
    onSuccess: (novoId) => navigate(`/pedidos/${novoId}`),
    onError: (e: unknown) => setErro(mensagemDeErro(e, "Erro ao duplicar.")),
  });
  const cancelar = useMutation({
    mutationFn: () => cancelarPedido(id!, motivoCancelamento),
    onSuccess: () => { setCancelando(false); setMotivoCancelamento(""); recarregar(); },
    onError: (e: unknown) => setErro(mensagemDeErro(e, "Erro ao cancelar.")),
  });

  // Desfecho da cotação: nem toda cotação vira pedido, e a empresa quer saber
  // por quê (reunião 16/07/2026).
  const motivosQuery = useQuery({ queryKey: ["motivosPerda"], queryFn: listarMotivosPerda });
  const versoesQuery = useQuery({ queryKey: ["versoes", id], queryFn: () => listarVersoes(id!) });
  const perder = useMutation({
    mutationFn: () => marcarCotacaoPerdida(id!, motivoPerdaId, observacaoPerda),
    onSuccess: () => { setPerdendo(false); setMotivoPerdaId(""); setObservacaoPerda(""); recarregar(); },
    onError: (e: unknown) => setErro(mensagemDeErro(e, "Erro ao registrar a perda.")),
  });
  const paramsQuery = useQuery({ queryKey: ["paramsAprovacao"], queryFn: obterParametrosAprovacao });
  const enviar = useMutation({
    mutationFn: () => enviarParaAprovacao(id!),
    onSuccess: recarregar,
    onError: (e: unknown) => setErro(mensagemDeErro(e, "Erro ao enviar para aprovação.")),
  });
  const decidir = useMutation({
    mutationFn: (aprovado: boolean) => decidirAprovacao(id!, aprovado, observacaoAprovacao),
    onSuccess: () => { setObservacaoAprovacao(""); recarregar(); },
    onError: (e: unknown) => setErro(mensagemDeErro(e, "Erro ao registrar a decisão.")),
  });
  const reabrirPerdida = useMutation({
    mutationFn: () => reabrirCotacaoPerdida(id!),
    onSuccess: recarregar,
    onError: (e: unknown) => setErro(mensagemDeErro(e, "Erro ao reabrir a cotação.")),
  });

  if (isLoading) return <p className="text-[var(--cor-texto-suave)]">Carregando…</p>;
  if (!pedido) return <p className="text-red-600">Pedido não encontrado.</p>;

  const fechado = pedido.status === "closed";
  const perdida = pedido.status === "lost";
  const params = paramsQuery.data;
  const verNumeros = podeVerCascataOperacional(perfil?.perfil);
  const souAprovador = podeAprovar(perfil?.perfil, params);
  const aprovacao = pedido.approval_status;
  const cancelado = Boolean(pedido.cancelled_at);
  const t = pedido.totals_display;
  const cascata = cascataQuery.data;
  const seloDaCascata = cascata?.ok ? seloMargemComercial(dec(cascata.margemContribuicaoPct)) : null;
  const exigeAprovacaoPeloSelo = seloDaCascata ? seloExigeAprovacao(seloDaCascata) : true;
  const podeFecharDiretoPeloSelo = Boolean(
    seloDaCascata &&
      !seloExigeAprovacao(seloDaCascata) &&
      (perfil?.perfil === "admin" || perfil?.perfil === "comercial")
  );
  const podeGerarPedido = !fechado && !cancelado && !perdida && (aprovacao === "aprovado" || !params?.require_approval || podeFecharDiretoPeloSelo);
  const statusFluxo = statusDoFluxoDoPedido({
    pedido,
    fechado,
    perdida,
    cancelado,
    aprovacao,
    seloDaCascata,
    exigeAprovacaoPeloSelo,
    podeGerarPedido,
  });
  // Segregação de funções: quem enviou a cotação não pode ser quem aprova —
  // senão aprovação vira só um clique a mais de quem já ia fechar de qualquer
  // jeito (mesma regra vale no banco, é a garantia real).
  const souRemetente = Boolean(perfil?.id) && pedido.submitted_by === perfil?.id;
  const pendenciasAprovacao = camposDeExpedicaoPendentes(pedido);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Orçamento / Pedido — {pedido.customers?.name ?? "sem cliente"}</h1>
          <Badge>{cancelado ? `Cancelado em ${dataCurta(pedido.cancelled_at)}` : fechado ? `Pedido gerado em ${dataCurta(pedido.closed_at)}` : pedido.status === "lost" ? "Cotação perdida" : "Orçamento em aberto"}</Badge>
          {!cancelado && !perdida && aprovacao !== "rascunho" && (
            <Badge>
              {aprovacao === "pendente" ? "Aguardando aprovação"
                : aprovacao === "aprovado" ? `Aprovado ${dataCurta(pedido.approved_at)}`
                : "Aprovação recusada"}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button className="bg-transparent text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)]" onClick={() => navigate(`/pedidos/${pedido.id}/ficha`)}>
            Ficha
          </Button>
          <Button className="bg-transparent text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)]" onClick={() => navigate("/pedidos")}>
            Voltar
          </Button>
        </div>
      </div>

      <Card className="space-y-1 text-sm">
        <p><span className="text-[var(--cor-texto-suave)]">Orçamento:</span> <strong className="font-mono">{pedido.quote_number ?? "—"}</strong></p>
        <p><span className="text-[var(--cor-texto-suave)]">Pedido:</span> <strong className="font-mono">{pedido.order_number ?? "—"}</strong></p>
        <p><span className="text-[var(--cor-texto-suave)]">Vendedor:</span> {pedido.sellers?.name ?? "—"} · <span className="text-[var(--cor-texto-suave)]">UF:</span> {pedido.uf ?? "—"} · <span className="text-[var(--cor-texto-suave)]">Comissão:</span> {pedido.commission_rate ?? "—"}</p>
        {fechado && (
          <p className="text-xs text-[var(--cor-texto-suave)]">
            Custos congelados no fechamento (snapshot imutável — Decisão D7). Este pedido nunca é recalculado.
          </p>
        )}
        {cancelado && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"><strong>Motivo do cancelamento:</strong> {pedido.cancellation_reason}</p>}
        {pedido.revised_from_order_id && <p className="text-sm">Revisão do pedido <button className="text-[var(--cor-primaria)] underline" onClick={() => navigate(`/pedidos/${pedido.revised_from_order_id}`)}>{pedido.revised_from_order_id.slice(0, 8)}</button></p>}
        {pedido.revisoes.length > 0 && <p className="text-sm">Revisões vinculadas: {pedido.revisoes.map((r, indice) => <span key={r.id}>{indice > 0 ? ", " : ""}<button className="text-[var(--cor-primaria)] underline" onClick={() => navigate(`/pedidos/${r.id}`)}>{r.id.slice(0, 8)}</button></span>)}</p>}
      </Card>

      {!cancelado && !perdida && (
        <Card className={`space-y-2 ${statusFluxo.classe}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">{statusFluxo.titulo}</h2>
              <p className="mt-1 text-sm">{statusFluxo.descricao}</p>
            </div>
            {seloDaCascata && cascata?.ok && !fechado && (
              <span className={`rounded-full px-4 py-2 text-sm font-semibold ${CORES_SELO_MARGEM[seloDaCascata.color] ?? "bg-gray-100 text-gray-800"}`}>
                {seloDaCascata.label} · {percentual(cascata.margemContribuicaoPct)}
              </span>
            )}
          </div>
        </Card>
      )}

      {!cancelado && <BlocoExpedicao pedido={pedido} />}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Qtd</th>
              <th className="px-4 py-3 font-medium">Preço</th>
              {verNumeros && <th className="px-4 py-3 font-medium">CMV un. {fechado ? "(congelado)" : "(vigente ao fechar)"}</th>}
            </tr>
          </thead>
          <tbody>
            {pedido.itens.map((i) => {
              const composicaoKit =
                (i.kit_composition_snapshot as Array<{ nome: string; quantidade: string }> | null) ??
                i.ad_hoc_kit_composicao ??
                null;
              return (
                <tr key={i.id} className="border-b border-[var(--cor-borda)] last:border-0">
                  <td className="px-4 py-3 font-medium">
                    <div className="font-mono text-xs font-bold text-[var(--cor-primaria)]">
                      {i.item_code_snapshot ?? i.products?.code ?? i.kits?.code ??
                        (i.ad_hoc_kit_composicao ? "código ao Gerar Pedido" : "")}
                    </div>
                    {/* Kit montado dentro deste pedido: ainda não tem código de
                        catálogo (ele nasce ao Gerar Pedido), mas tem nome e
                        composição — e é isso que a conferência lê. */}
                    {i.products?.name ??
                      (i.kits
                        ? `[Kit] ${i.kits.name}`
                        : i.ad_hoc_kit_composicao
                          ? `[Kit] ${i.ad_hoc_kit_label?.trim() || "Kit montado no pedido"}`
                          : "—")}
                    {/* Nome fiscal ao lado do nome do catálogo — só quando os
                        dois diferem, para não repetir a mesma linha. */}
                    {i.products?.nf_description && i.products.nf_description !== i.products.name && (
                      <div className="mt-0.5 text-xs font-normal text-[var(--cor-texto-suave)]">
                        NF: {i.products.nf_description}
                      </div>
                    )}
                    {composicaoKit && composicaoKit.length > 0 && (
                      <div className="mt-1 text-xs font-normal text-[var(--cor-texto-suave)]">
                        {fechado ? "Composição congelada" : "Composição do kit"}:{" "}
                        {composicaoKit.map((c) => `${c.quantidade}× ${c.nome}`).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">{i.quantity}</td>
                  <td className="px-4 py-3">{reais(i.unit_price)}</td>
                  {verNumeros && (
                    <td className="px-4 py-3">
                      {reais(fechado ? i.cmv_unit_snapshot : (cascata?.ok ? cascata.cmvPorItem.get(i.id) ?? null : null))}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {fechado && t && (
        <Card className="space-y-1">
          <h2 className="mb-2 text-lg font-semibold">Cascata congelada</h2>
          {!verNumeros && (
            <p className="mb-2 text-sm text-[var(--cor-texto-suave)]">
              Os valores de custo e margem ficam visíveis para quem aprova.
            </p>
          )}
          {verNumeros && <table className="w-full text-sm">
            <tbody>
              <Linha rotulo="Receita bruta" valor={t.receita_bruta} />
              <Linha rotulo="(−) Impostos + DIFAL" valor={`${t.impostos} + ${t.difal}`} />
              <Linha rotulo="= Receita líquida" valor={t.receita_liquida} destaque />
              <Linha rotulo="(−) CMV" valor={t.cmv} />
              <Linha rotulo="= MARGEM DE CONTRIBUIÇÃO" valor={t.margem_contribuicao} destaque />
              {/* Pedidos fechados antes de 29/07/2026 têm rateio no snapshot;
                  os novos não. O snapshot nunca é reescrito. */}
              {Number(t.despesa_alocada) > 0 && (
                <>
                  <Linha rotulo="(−) Despesa alocada (rateio)" valor={t.despesa_alocada} />
                  <Linha rotulo="= Resultado após rateio (informativo)" valor={t.resultado_apos_rateio} />
                </>
              )}
            </tbody>
          </table>}
        </Card>
      )}

      {!fechado && !cancelado && !perdida && verNumeros && pedido.itens.length > 0 && (
        <Card className="space-y-1">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Cascata (custos vigentes)</h2>
            {seloDaCascata && cascata?.ok && (
              <span className={`rounded-full px-4 py-2 text-sm font-semibold ${CORES_SELO_MARGEM[seloDaCascata.color] ?? "bg-gray-100 text-gray-800"}`}>
                {seloDaCascata.label} · {percentual(cascata.margemContribuicaoPct)}
              </span>
            )}
          </div>
          <p className="mb-2 text-sm text-[var(--cor-texto-suave)]">
            Pedido ainda em cotação — nada aqui está gravado. Calculado agora com os custos e
            alíquotas vigentes; pode mudar até o fechamento (Decisão D7).
          </p>
          {cascataQuery.isLoading && <p className="text-sm text-[var(--cor-texto-suave)]">Calculando…</p>}
          {cascata && !cascata.ok && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{cascata.erro}</p>
          )}
          {cascata?.ok && (
            <table className="w-full text-sm">
              <tbody>
                <Linha rotulo="Receita bruta" valor={cascata.totals.receita_bruta} />
                <Linha rotulo="(−) Impostos sobre venda" valor={cascata.totals.impostos} />
                <Linha
                  rotulo={`(−) DIFAL${pedido.applies_difal ? "" : " — dispensado (cliente contribuinte)"}`}
                  valor={cascata.totals.difal}
                />
                <Linha rotulo="= Receita líquida" valor={cascata.totals.receita_liquida} destaque />
                <Linha rotulo="(−) CMV" valor={cascata.totals.cmv} />
                <Linha rotulo="= MARGEM DE CONTRIBUIÇÃO" valor={cascata.totals.margem_contribuicao} destaque />
              </tbody>
            </table>
          )}
        </Card>
      )}

      {kitsCriados.length > 0 && (
        <div className="rounded-md bg-green-50 px-3 py-3 text-sm text-green-900">
          <strong>
            {kitsCriados.some((k) => k.novo)
              ? "Kits deste pedido — o código oficial nasceu agora:"
              : "Kits deste pedido (a composição já existia; o código é o mesmo):"}
          </strong>
          <ul className="mt-1 space-y-0.5">
            {kitsCriados.map((k) => (
              <li key={k.id}>
                <button
                  type="button"
                  className="font-mono font-semibold underline"
                  onClick={() => navigate(`/kits/${k.id}`)}
                >
                  {k.code ?? "—"}
                </button>{" "}
                — {k.name}
                {!k.novo && " (já existia; código reaproveitado)"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      <div className="flex gap-2">
        {!fechado && !cancelado && !perdida && aprovacao === "rascunho" && params?.require_approval && exigeAprovacaoPeloSelo && (
          <Button
            disabled={enviar.isPending}
            onClick={() => {
              setErro(null);
              if (pendenciasAprovacao.length > 0) {
                setErro(`Preencha antes de enviar para aprovação: ${pendenciasAprovacao.join(", ")}.`);
                return;
              }
              enviar.mutate();
            }}
          >
            {enviar.isPending ? "Enviando…" : "Enviar para aprovação"}
          </Button>
        )}
        {podeGerarPedido && (
          <Button
            disabled={fechar.isPending}
            onClick={() => {
              setErro(null);
              if (window.confirm("Gerar pedido? Os custos serão congelados e esta versão não mudará mais.")) {
                fechar.mutate();
              }
            }}
          >
            {fechar.isPending ? "Gerando…" : "Gerar Pedido"}
          </Button>
        )}
        {fechado && !cancelado && perfil?.perfil === "admin" && (
          <Button
            className="bg-amber-600"
            disabled={reabrir.isPending}
            onClick={() => {
              setErro(null);
              if (window.confirm("Criar uma revisão? O pedido fechado continuará imutável e uma nova simulação vinculada será criada.")) {
                reabrir.mutate();
              }
            }}
          >
            Criar revisão (Admin)
          </Button>
        )}
        {!fechado && !cancelado && !perdida && (
          <Button className="bg-amber-700" onClick={() => { setErro(null); setPerdendo(true); }}>
            Marcar como perdida
          </Button>
        )}
        {perdida && !cancelado && (
          <Button className="bg-amber-600" disabled={reabrirPerdida.isPending} onClick={() => reabrirPerdida.mutate()}>
            Reabrir cotação
          </Button>
        )}
        {/* Editar só existe enquanto ninguém decidiu nada sobre este pedido —
            rascunho (nunca enviado) ou recusado (volta para a mesa). O banco
            recusa fora disso (migração 20260805200000); a tela nem oferece o
            botão para não anunciar uma ação que ia falhar. */}
        {!fechado && !cancelado && !perdida && (aprovacao === "rascunho" || aprovacao === "recusado") && (
          <Button
            className="bg-transparent text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)]"
            onClick={() => navigate(`/simulador/${pedido.id}`)}
          >
            Editar
          </Button>
        )}
        <Button className="bg-transparent text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)]" disabled={duplicar.isPending} onClick={() => duplicar.mutate()}>
          Duplicar como nova simulação
        </Button>
        {!cancelado && (perfil?.perfil === "admin" || (!fechado && perfil?.perfil === "comercial")) && (
          <Button className="bg-red-700" onClick={() => { setErro(null); setCancelando(true); }}>Cancelar</Button>
        )}
      </div>
      {cancelando && <Card className="space-y-3 border-red-200">
        <h2 className="font-semibold">Confirmar cancelamento</h2>
        <p className="text-sm text-[var(--cor-texto-suave)]">{fechado ? "O valor será estornado na DRE do mês do cancelamento; o fechamento original permanecerá no mês em que ocorreu." : "A simulação será preservada no histórico como cancelada."}</p>
        <Input value={motivoCancelamento} onChange={(e) => setMotivoCancelamento(e.target.value)} placeholder="Motivo obrigatório (mínimo 5 caracteres)" />
        <div className="flex gap-2"><Button className="bg-red-700" disabled={cancelar.isPending || motivoCancelamento.trim().length < 5} onClick={() => {
          if (window.confirm("Confirma o cancelamento deste pedido?")) cancelar.mutate();
        }}>{cancelar.isPending ? "Cancelando…" : "Confirmar cancelamento"}</Button>
        <Button className="bg-transparent text-[var(--cor-texto-suave)]" onClick={() => setCancelando(false)}>Voltar</Button></div>
      </Card>}

      {/* Status para quem ENVIOU — nem sempre é aprovador (a vendedora, o
          caso mais comum, normalmente não é). Sem explicar a regra de quem
          pode decidir: só o status e o que fazer agora, porque no primeiro
          momento a ficha impressa ainda precisa ir até a admin na mão. */}
      {aprovacao === "pendente" && souRemetente && !cancelado && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-900">
            <strong>Pedido enviado para aprovação{pedido.submitted_at ? ` em ${dataCurta(pedido.submitted_at)}` : ""}.</strong>{" "}
            Imprima a ficha do pedido e leve até quem aprova.
          </p>
          <Button
            className="mt-2 bg-transparent text-amber-900 underline hover:bg-transparent"
            onClick={() => navigate(`/pedidos/${pedido.id}/ficha`)}
          >
            Abrir ficha do pedido
          </Button>
        </Card>
      )}

      {aprovacao === "pendente" && souAprovador && !souRemetente && !cancelado && (
        <Card className="space-y-3 border-[var(--cor-primaria)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Aprovação do pedido</h2>
            {seloDaCascata && cascata?.ok && (
              <span className={`rounded-full px-4 py-2 text-sm font-semibold ${CORES_SELO_MARGEM[seloDaCascata.color] ?? "bg-gray-100 text-gray-800"}`}>
                {seloDaCascata.label} · {percentual(cascata.margemContribuicaoPct)}
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--cor-texto-suave)]">
            Confira preço de venda, CMV e margem de contribuição acima antes de decidir.
            É o que o papel na pasta não mostrava.
          </p>
          <Input
            value={observacaoAprovacao}
            onChange={(e) => setObservacaoAprovacao(e.target.value)}
            placeholder="Observação (opcional)"
          />
          <div className="flex gap-2">
            <Button disabled={decidir.isPending} onClick={() => { setErro(null); decidir.mutate(true); }}>
              {decidir.isPending ? "Registrando…" : "Aprovar"}
            </Button>
            <Button className="bg-red-700" disabled={decidir.isPending} onClick={() => { setErro(null); decidir.mutate(false); }}>
              Recusar
            </Button>
          </div>
        </Card>
      )}

      {aprovacao === "recusado" && (
        <Card className="border-red-200">
          <p className="text-sm text-red-700">
            <strong>Aprovação recusada.</strong>{pedido.approval_notes ? ` ${pedido.approval_notes}` : ""} Ajuste a
            cotação e envie de novo.
          </p>
        </Card>
      )}

      {perdendo && <Card className="space-y-3 border-amber-200">
        <h2 className="font-semibold">Registrar perda da cotação</h2>
        <p className="text-sm text-[var(--cor-texto-suave)]">
          Sem o motivo registrado não há como responder depois “por que a gente não vendeu?”.
          O preço de venda e o custo desta cotação ficam guardados junto.
        </p>
        <select
          className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
          value={motivoPerdaId}
          onChange={(e) => setMotivoPerdaId(e.target.value)}
        >
          <option value="">Selecione o motivo…</option>
          {(motivosQuery.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <Input value={observacaoPerda} onChange={(e) => setObservacaoPerda(e.target.value)} placeholder="Observação (opcional)" />
        <div className="flex gap-2">
          <Button className="bg-amber-700" disabled={perder.isPending || !motivoPerdaId} onClick={() => perder.mutate()}>
            {perder.isPending ? "Registrando…" : "Confirmar perda"}
          </Button>
          <Button className="bg-transparent text-[var(--cor-texto-suave)]" onClick={() => setPerdendo(false)}>Voltar</Button>
        </div>
      </Card>}

      {(versoesQuery.data ?? []).length > 1 && <Card className="space-y-2">
        <h2 className="font-semibold">Versões da cotação</h2>
        <p className="text-sm text-[var(--cor-texto-suave)]">
          Cada alteração pedida pelo cliente ficou registrada. A versão mais alta é a atual;
          a faixa mostra se aquela versão seguiria direto ou dependeria de aprovação.
        </p>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[var(--cor-texto-suave)]">
            <th className="py-1 font-medium">Versão</th><th className="py-1 font-medium">Quando</th><th className="py-1 font-medium">Usuário</th>
            <th className="py-1 text-right font-medium">Receita</th><th className="py-1 text-right font-medium">Margem</th>
            <th className="py-1 text-right font-medium">Faixa</th><th className="py-1 text-right font-medium">Aprovação</th>
          </tr></thead>
          <tbody>
            {(versoesQuery.data ?? []).map((v) => {
              const foto = v.snapshot as Record<string, string | undefined>;
              const usuario = Array.isArray(v.profiles) ? v.profiles[0]?.full_name : v.profiles?.full_name;
              const margemPctVersao = margemPctDaVersao(foto);
              const seloVersao = margemPctVersao ? seloMargemComercial(dec(margemPctVersao)) : null;
              return (
                <tr key={v.version} className="border-t border-[var(--cor-borda)]">
                  <td className="py-1">v{v.version}</td>
                  <td className="py-1 text-[var(--cor-texto-suave)]">{dataCurta(v.created_at)}</td>
                  <td className="py-1">{usuario ?? "—"}</td>
                  <td className="py-1 text-right">{reais(foto.receita_bruta)}</td>
                  <td className="py-1 text-right">
                    {reais(foto.margem_contribuicao)}
                    <span className="ml-1 text-[var(--cor-texto-suave)]">({percentual(margemPctVersao)})</span>
                  </td>
                  <td className="py-1 text-right">
                    {seloVersao ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CORES_SELO_MARGEM[seloVersao.color] ?? "bg-gray-100 text-gray-800"}`}>
                        {seloVersao.label}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="py-1 text-right text-[var(--cor-texto-suave)]">
                    {seloVersao ? (seloExigeAprovacao(seloVersao) ? "Exige aprovação" : "Aprovação automática") : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>}
    </div>
  );
}

function statusDoFluxoDoPedido({
  pedido,
  fechado,
  perdida,
  cancelado,
  aprovacao,
  seloDaCascata,
  exigeAprovacaoPeloSelo,
  podeGerarPedido,
}: {
  pedido: PedidoCompleto;
  fechado: boolean;
  perdida: boolean;
  cancelado: boolean;
  aprovacao: PedidoCompleto["approval_status"];
  seloDaCascata: ReturnType<typeof seloMargemComercial> | null;
  exigeAprovacaoPeloSelo: boolean;
  podeGerarPedido: boolean;
}) {
  if (cancelado) {
    return {
      titulo: "Pedido cancelado",
      descricao: "Este registro fica preservado para histórico, sem seguir para pedido.",
      classe: "border-red-200 bg-red-50 text-red-800",
    };
  }
  if (perdida) {
    return {
      titulo: "Cotação perdida",
      descricao: "A cotação foi encerrada como perdida. Reabra apenas se ela voltar para negociação.",
      classe: "border-amber-200 bg-amber-50 text-amber-900",
    };
  }
  if (fechado) {
    return {
      titulo: "Pedido gerado",
      descricao: `O pedido ${pedido.order_number ?? ""} foi gerado e os custos desta versão estão congelados.`,
      classe: "border-green-200 bg-green-50 text-green-900",
    };
  }
  if (aprovacao === "pendente") {
    return {
      titulo: "Aguardando aprovação",
      descricao: "Esta versão está em faixa que exige aprovação. Depois de aprovada, a ação Gerar Pedido fica liberada.",
      classe: "border-amber-200 bg-amber-50 text-amber-900",
    };
  }
  if (aprovacao === "recusado") {
    return {
      titulo: "Aprovação recusada",
      descricao: "Ajuste a cotação, salve uma nova versão e envie novamente para aprovação.",
      classe: "border-red-200 bg-red-50 text-red-800",
    };
  }
  if (podeGerarPedido && seloDaCascata && !exigeAprovacaoPeloSelo) {
    return {
      titulo: "Pronto para Gerar Pedido",
      descricao: `Margem ${seloDaCascata.label.toLowerCase()} aprovada automaticamente. O código de pedido já está reservado; clique em Gerar Pedido para congelar esta versão.`,
      classe: "border-green-200 bg-green-50 text-green-900",
    };
  }
  if (seloDaCascata && exigeAprovacaoPeloSelo) {
    return {
      titulo: "Precisa enviar para aprovação",
      descricao: `Margem ${seloDaCascata.label.toLowerCase()} exige aprovação antes de gerar pedido.`,
      classe: "border-amber-200 bg-amber-50 text-amber-900",
    };
  }
  if (podeGerarPedido) {
    return {
      titulo: "Pronto para Gerar Pedido",
      descricao: "A cotação está liberada para virar pedido. Ao gerar, os custos da versão atual serão congelados.",
      classe: "border-green-200 bg-green-50 text-green-900",
    };
  }
  return {
    titulo: "Orçamento em aberto",
    descricao: "Complete os dados da cotação para o sistema indicar se ela pode virar pedido direto ou se precisa de aprovação.",
    classe: "border-[var(--cor-borda)]",
  };
}

function valorDoSnapshot(foto: Record<string, unknown>, chave: string, chavePedido?: string): string | null {
  const direto = foto[chave];
  const pedido = foto.pedido as Record<string, unknown> | undefined;
  const aninhado = chavePedido ? pedido?.[chavePedido] : undefined;
  const valor = direto ?? aninhado;
  return valor == null || valor === "" ? null : String(valor);
}

function margemPctDaVersao(foto: Record<string, unknown>): string | null {
  const pct = valorDoSnapshot(foto, "margem_contribuicao_pct", "contribution_margin_pct_snapshot");
  if (pct) return pct;
  const margem = valorDoSnapshot(foto, "margem_contribuicao", "contribution_margin_snapshot");
  const receitaLiquida = valorDoSnapshot(foto, "receita_liquida", "net_revenue_snapshot");
  if (!margem || !receitaLiquida) return null;
  try {
    const receita = dec(receitaLiquida);
    if (receita.isZero()) return null;
    return dec(margem).div(receita).toString();
  } catch {
    return null;
  }
}

function camposDeExpedicaoPendentes(pedido: PedidoCompleto): string[] {
  const pendencias: string[] = [];
  if (!pedido.carrier_id) pendencias.push("transportadora");
  if (pedido.carriers?.requires_name && !pedido.carrier_other?.trim()) pendencias.push("nome da transportadora");
  if (!pedido.payment_term_id && pedido.payment_term_days == null) pendencias.push("modo de pagamento");
  if (!pedido.shipping_zip && !pedido.customers?.shipping_zip) pendencias.push("CEP de entrega");
  return pendencias;
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <tr className={destaque ? "font-semibold" : ""}>
      <td className="py-1">{rotulo}</td>
      <td className="py-1 text-right">{reais(valor)}</td>
    </tr>
  );
}

// ---------- Expedição (formulário de pedido, 05/08/2026) ----------
//
// Fica numa faixa própria porque tem um ciclo de vida diferente do resto do
// pedido: peso e volume só existem quando alguém embala a caixa, o que
// normalmente é DEPOIS de o pedido ter sido ganho. No papel de hoje, é
// exatamente isso que se escreve à mão nessa hora.
//
// O banco abre esta exceção — e só ela — na regra de imutabilidade do pedido
// fechado, comparando coluna a coluna e registrando em auditoria. Tentar
// alterar frete, comissão ou qualquer valor junto continua sendo recusado.
function BlocoExpedicao({ pedido }: { pedido: PedidoCompleto }) {
  const queryClient = useQueryClient();
  const { data: transportadoras } = useQuery({
    queryKey: ["transportadoras"],
    queryFn: listarTransportadoras,
  });
  const { data: modosPagamento } = useQuery({
    queryKey: ["modosPagamento"],
    queryFn: listarModosPagamento,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [d, setD] = useState<DadosExpedicao>({
    carrierId: pedido.carrier_id ?? "",
    carrierOutra: pedido.carrier_other ?? "",
    fretesCotados: (pedido.freight_quotes ?? []).map((f) => ({ ...FRETE_COTADO_VAZIO, ...f, id: f.id || novoFreteCotado().id })),
    pesoKg: pedido.weight_kg ?? "",
    volumes: pedido.volumes != null ? String(pedido.volumes) : "",
    cepEntrega: formatarCep(pedido.shipping_zip),
    modoPagamentoId: pedido.payment_term_id ?? "",
    prazoPagamentoDias: pedido.payment_term_days != null ? String(pedido.payment_term_days) : "",
    observacao: pedido.order_notes ?? "",
  });

  const gravar = useMutation({
    mutationFn: () => salvarExpedicao(pedido.id, d),
    onSuccess: () => {
      setErro(null);
      setSalvo(true);
      queryClient.invalidateQueries({ queryKey: ["pedido", pedido.id] });
    },
    onError: (e: unknown) => setErro(mensagemDeErro(e, "Erro ao salvar.")),
  });

  const mudar = (campo: keyof DadosExpedicao) => (valor: string) => {
    setD((a) => ({ ...a, [campo]: valor }));
    setSalvo(false);
  };

  function atualizarFreteCotado(id: string, muda: Partial<FreteCotadoPedido>) {
    setD((atual) => {
      const fretesCotados = atual.fretesCotados.map((f) => {
        if (f.id !== id) return f;
        const proximo = { ...f, ...muda };
        if (muda.carrierId !== undefined) {
          const carrier = (transportadoras ?? []).find((t) => t.id === muda.carrierId);
          proximo.carrierName = carrier?.nome ?? null;
          if (!carrier?.pedeNome) proximo.carrierOther = null;
        }
        return proximo;
      });
      const selecionada = fretesCotados.find((f) => f.selected);
      return {
        ...atual,
        fretesCotados,
        carrierId: selecionada?.carrierId ?? atual.carrierId,
        carrierOutra: selecionada?.carrierOther ?? atual.carrierOutra,
      };
    });
    setSalvo(false);
  }

  function selecionarFreteCotado(freteCotado: FreteCotadoPedido) {
    setD((atual) => ({
      ...atual,
      carrierId: freteCotado.carrierId ?? "",
      carrierOutra: freteCotado.carrierOther ?? "",
      fretesCotados: atual.fretesCotados.map((f) => ({ ...f, selected: f.id === freteCotado.id })),
    }));
    setSalvo(false);
  }

  function removerFreteCotado(id: string) {
    setD((atual) => ({ ...atual, fretesCotados: atual.fretesCotados.filter((f) => f.id !== id) }));
    setSalvo(false);
  }

  const escolhida = (transportadoras ?? []).find((t) => t.id === d.carrierId) ?? null;
  const cepInvalido = (d.cepEntrega ?? "").trim() !== "" && !cepValido(d.cepEntrega);

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Condições</h2>
        </div>

        {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
        {salvo && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">Dados registrados.</p>}

        <div>
          <Label>Condição de pagamento</Label>
          <select
            className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
            value={d.modoPagamentoId ?? ""}
            onChange={(e) => mudar("modoPagamentoId")(e.target.value)}
          >
            <option value="">—</option>
            {(modosPagamento ?? []).map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        <div>
          <Label>Obs</Label>
          <textarea
            className="w-full rounded-[0.625rem] border border-[var(--cor-borda)] bg-white px-3 py-2 text-sm"
            rows={2}
            value={d.observacao ?? ""}
            onChange={(e) => mudar("observacao")(e.target.value)}
            placeholder="Sai impressa na ficha do pedido."
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Expedição</h2>
          <p className="text-sm text-[var(--cor-texto-suave)]">
            Preencha na hora de embalar. Estes campos podem ser alterados mesmo depois de o pedido
            ter sido ganho — e só eles: qualquer valor de dinheiro continua congelado.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <Label>Transportadora</Label>
            <select
              className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
              value={d.carrierId ?? ""}
              onChange={(e) => mudar("carrierId")(e.target.value)}
            >
              <option value="">—</option>
              {(transportadoras ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>
          {escolhida?.pedeNome && (
            <div>
              <Label>Qual transportadora</Label>
              <Input
                value={d.carrierOutra ?? ""}
                onChange={(e) => mudar("carrierOutra")(e.target.value)}
              />
            </div>
          )}
          <div className="col-span-2 space-y-2 md:col-span-4">
            <div className="flex items-center justify-between gap-3">
              <Label>Opções de frete cotadas</Label>
              <Button
                type="button"
                className="bg-transparent text-[var(--cor-primaria)] hover:bg-[var(--cor-fundo)]"
                onClick={() =>
                  setD((atual) => ({
                    ...atual,
                    fretesCotados: [...atual.fretesCotados, novoFreteCotado()],
                  }))
                }
              >
                Adicionar opção
              </Button>
            </div>
            {d.fretesCotados.length > 0 ? (
              <div className="overflow-x-auto rounded-md border border-[var(--cor-borda)]">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-[var(--cor-fundo)] text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">Escolhida</th>
                      <th className="px-3 py-2 font-medium">Transportadora</th>
                      <th className="px-3 py-2 font-medium">Outra / código cotação</th>
                      <th className="px-3 py-2 font-medium">Valor</th>
                      <th className="px-3 py-2 font-medium">Prazo</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {d.fretesCotados.map((opcao) => {
                      const carrierDaOpcao = (transportadoras ?? []).find((t) => t.id === opcao.carrierId);
                      return (
                        <tr key={opcao.id} className="border-t border-[var(--cor-borda)]">
                          <td className="px-3 py-2">
                            <input
                              type="radio"
                              checked={opcao.selected}
                              onChange={() => selecionarFreteCotado(opcao)}
                              aria-label="Marcar frete escolhido"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
                              value={opcao.carrierId ?? ""}
                              onChange={(e) => atualizarFreteCotado(opcao.id, { carrierId: e.target.value || null })}
                            >
                              <option value="">—</option>
                              {(transportadoras ?? []).map((t) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                value={opcao.carrierOther ?? ""}
                                disabled={!carrierDaOpcao?.pedeNome}
                                onChange={(e) => atualizarFreteCotado(opcao.id, { carrierOther: e.target.value })}
                                placeholder={carrierDaOpcao?.pedeNome ? "Nome" : "—"}
                              />
                              <Input
                                value={opcao.quoteCode ?? ""}
                                onChange={(e) => atualizarFreteCotado(opcao.id, { quoteCode: e.target.value })}
                                placeholder="Código"
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              value={opcao.amount ?? ""}
                              onChange={(e) => atualizarFreteCotado(opcao.id, { amount: e.target.value })}
                              placeholder="R$"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              value={opcao.leadTimeDays ?? ""}
                              onChange={(e) => atualizarFreteCotado(opcao.id, { leadTimeDays: e.target.value })}
                              placeholder="dias"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              type="button"
                              className="bg-transparent text-red-600 hover:bg-red-50"
                              onClick={() => removerFreteCotado(opcao.id)}
                            >
                              Remover
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-md bg-[var(--cor-fundo)] px-3 py-2 text-sm text-[var(--cor-texto-suave)]">
                Nenhuma opção cotada registrada.
              </p>
            )}
          </div>
          <div>
            <Label>Peso (kg)</Label>
            <Input value={d.pesoKg ?? ""} onChange={(e) => mudar("pesoKg")(e.target.value)} placeholder="ex.: 12,5" />
          </div>
          <div>
            <Label>Volumes</Label>
            <Input value={d.volumes ?? ""} onChange={(e) => mudar("volumes")(e.target.value)} placeholder="ex.: 3" />
          </div>
          <div>
            <Label>CEP de entrega</Label>
            <Input
              value={d.cepEntrega ?? ""}
              onChange={(e) => mudar("cepEntrega")(e.target.value)}
              onBlur={() => mudar("cepEntrega")(formatarCep(d.cepEntrega))}
              placeholder="00000-000"
            />
            {cepInvalido && <p className="mt-1 text-xs text-red-600">CEP precisa ter 8 dígitos.</p>}
          </div>
        </div>

        <Button disabled={gravar.isPending || cepInvalido} onClick={() => gravar.mutate()}>
          {gravar.isPending ? "Salvando…" : "Salvar condições e expedição"}
        </Button>
      </Card>
    </div>
  );
}
