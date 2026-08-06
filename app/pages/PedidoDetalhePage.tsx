import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  calcularCascataVigente,
  cancelarPedido,
  duplicarPedido,
  fecharPedido,
  obterPedidoCompleto,
  reabrirPedido,
  salvarExpedicao,
  type DadosExpedicao,
  type KitMaterializado,
  type PedidoCompleto,
} from "../lib/db/fechamento";
import {
  listarMotivosPerda,
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
  podeVerNumerosDeMargem,
} from "../lib/db/aprovacao";
import { useAuth } from "../auth/AuthProvider";
import { dataCurta, reais } from "../lib/format";
import { cepValido, formatarCep } from "../../lib/cadastro/documentos";
import { Badge, Button, Card, Input, Label } from "@components/ui/primitives";

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
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao fechar."),
  });
  const reabrir = useMutation({
    mutationFn: () => reabrirPedido(id!),
    onSuccess: (novoId) => navigate(`/pedidos/${novoId}`),
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao reabrir (apenas Administrador)."),
  });
  const duplicar = useMutation({
    mutationFn: () => duplicarPedido(id!),
    onSuccess: (novoId) => navigate(`/pedidos/${novoId}`),
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao duplicar."),
  });
  const cancelar = useMutation({
    mutationFn: () => cancelarPedido(id!, motivoCancelamento),
    onSuccess: () => { setCancelando(false); setMotivoCancelamento(""); recarregar(); },
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao cancelar."),
  });

  // Desfecho da cotação: nem toda cotação vira pedido, e a empresa quer saber
  // por quê (reunião 16/07/2026).
  const motivosQuery = useQuery({ queryKey: ["motivosPerda"], queryFn: listarMotivosPerda });
  const versoesQuery = useQuery({ queryKey: ["versoes", id], queryFn: () => listarVersoes(id!) });
  const perder = useMutation({
    mutationFn: () => marcarCotacaoPerdida(id!, motivoPerdaId, observacaoPerda),
    onSuccess: () => { setPerdendo(false); setMotivoPerdaId(""); setObservacaoPerda(""); recarregar(); },
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao registrar a perda."),
  });
  const paramsQuery = useQuery({ queryKey: ["paramsAprovacao"], queryFn: obterParametrosAprovacao });
  const enviar = useMutation({
    mutationFn: () => enviarParaAprovacao(id!),
    onSuccess: recarregar,
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao enviar para aprovação."),
  });
  const decidir = useMutation({
    mutationFn: (aprovado: boolean) => decidirAprovacao(id!, aprovado, observacaoAprovacao),
    onSuccess: () => { setObservacaoAprovacao(""); recarregar(); },
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao registrar a decisão."),
  });
  const reabrirPerdida = useMutation({
    mutationFn: () => reabrirCotacaoPerdida(id!),
    onSuccess: recarregar,
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao reabrir a cotação."),
  });

  if (isLoading) return <p className="text-[var(--cor-texto-suave)]">Carregando…</p>;
  if (!pedido) return <p className="text-red-600">Pedido não encontrado.</p>;

  const fechado = pedido.status === "closed";
  const perdida = pedido.status === "lost";
  const params = paramsQuery.data;
  const verNumeros = podeVerNumerosDeMargem(perfil?.perfil, params);
  const souAprovador = podeAprovar(perfil?.perfil, params);
  const aprovacao = pedido.approval_status;
  const cancelado = Boolean(pedido.cancelled_at);
  const t = pedido.totals_display;
  const cascata = cascataQuery.data;
  // Segregação de funções: quem enviou a cotação não pode ser quem aprova —
  // senão aprovação vira só um clique a mais de quem já ia fechar de qualquer
  // jeito (mesma regra vale no banco, é a garantia real).
  const souRemetente = Boolean(perfil?.id) && pedido.submitted_by === perfil?.id;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Pedido — {pedido.customers?.name ?? "sem cliente"}</h1>
          <Badge>{cancelado ? `Cancelado em ${dataCurta(pedido.cancelled_at)}` : fechado ? `Ganho em ${dataCurta(pedido.closed_at)}` : pedido.status === "lost" ? "Cotação perdida" : "Em cotação"}</Badge>
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
            Ficha do pedido
          </Button>
          <Button className="bg-transparent text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)]" onClick={() => navigate("/pedidos")}>
            Voltar
          </Button>
        </div>
      </div>

      <Card className="space-y-1 text-sm">
        <p><span className="text-[var(--cor-texto-suave)]">Orçamento:</span> <strong className="font-mono">{pedido.quote_number ?? "—"}</strong></p>
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
            {pedido.itens.map((i) => (
              <tr key={i.id} className="border-b border-[var(--cor-borda)] last:border-0">
                <td className="px-4 py-3 font-medium">
                  <div className="font-mono text-xs font-bold text-[var(--cor-primaria)]">
                    {i.item_code_snapshot ?? i.products?.code ?? i.kits?.code ??
                      (i.ad_hoc_kit_composicao ? "código ao ganhar" : "")}
                  </div>
                  {/* Kit montado dentro deste pedido: ainda não tem código de
                      catálogo (ele nasce quando o pedido é ganho), mas tem
                      nome e composição — e é isso que a conferência lê. */}
                  {i.products?.name ??
                    (i.kits
                      ? `[Kit] ${i.kits.name}`
                      : i.ad_hoc_kit_composicao
                        ? `[Kit] ${i.ad_hoc_kit_label?.trim() || "Kit montado no pedido"}`
                        : "—")}
                  {i.ad_hoc_kit_composicao && (
                    <div className="mt-1 text-xs font-normal text-[var(--cor-texto-suave)]">
                      {i.ad_hoc_kit_composicao.map((c) => `${c.quantidade}× ${c.nome}`).join(" · ")}
                    </div>
                  )}
                  {/* Nome fiscal ao lado do nome do catálogo — só quando os
                      dois diferem, para não repetir a mesma linha. */}
                  {i.products?.nf_description && i.products.nf_description !== i.products.name && (
                    <div className="mt-0.5 text-xs font-normal text-[var(--cor-texto-suave)]">
                      NF: {i.products.nf_description}
                    </div>
                  )}
                  {fechado && i.kit_composition_snapshot != null && (
                    <div className="mt-1 text-xs text-[var(--cor-texto-suave)]">
                      Composição congelada:{" "}
                      {(i.kit_composition_snapshot as Array<{ nome: string; quantidade: string }>)
                        .map((c) => `${c.quantidade}× ${c.nome}`)
                        .join(" · ")}
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
            ))}
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
          <h2 className="mb-2 text-lg font-semibold">Cascata (custos vigentes)</h2>
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
        {!fechado && !cancelado && !perdida && aprovacao === "rascunho" && params?.require_approval && (
          <Button disabled={enviar.isPending} onClick={() => { setErro(null); enviar.mutate(); }}>
            {enviar.isPending ? "Enviando…" : "Enviar para aprovação"}
          </Button>
        )}
        {!fechado && !cancelado && !perdida && (aprovacao === "aprovado" || !params?.require_approval) && (
          <Button
            disabled={fechar.isPending}
            onClick={() => {
              setErro(null);
              if (window.confirm("Fechar o pedido? Os custos serão CONGELADOS e não mudarão mais (snapshot imutável).")) {
                fechar.mutate();
              }
            }}
          >
            {fechar.isPending ? "Fechando…" : "Fechar pedido (congela custos)"}
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
          <h2 className="font-semibold">Aprovação do pedido</h2>
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
          Cada alteração pedida pelo cliente ficou registrada. A versão mais alta é a atual.
        </p>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[var(--cor-texto-suave)]">
            <th className="py-1 font-medium">Versão</th><th className="py-1 font-medium">Quando</th>
            <th className="py-1 text-right font-medium">Receita</th><th className="py-1 text-right font-medium">Margem contrib.</th>
          </tr></thead>
          <tbody>
            {(versoesQuery.data ?? []).map((v) => {
              const foto = v.snapshot as Record<string, string | undefined>;
              return (
                <tr key={v.version} className="border-t border-[var(--cor-borda)]">
                  <td className="py-1">v{v.version}</td>
                  <td className="py-1 text-[var(--cor-texto-suave)]">{dataCurta(v.created_at)}</td>
                  <td className="py-1 text-right">{reais(foto.receita_bruta)}</td>
                  <td className="py-1 text-right">{reais(foto.margem_contribuicao)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>}
    </div>
  );
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
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [d, setD] = useState<DadosExpedicao>({
    carrierId: pedido.carrier_id ?? "",
    carrierOutra: pedido.carrier_other ?? "",
    pesoKg: pedido.weight_kg ?? "",
    volumes: pedido.volumes != null ? String(pedido.volumes) : "",
    cepEntrega: formatarCep(pedido.shipping_zip),
    observacao: pedido.order_notes ?? "",
  });

  const gravar = useMutation({
    mutationFn: () => salvarExpedicao(pedido.id, d),
    onSuccess: () => {
      setErro(null);
      setSalvo(true);
      queryClient.invalidateQueries({ queryKey: ["pedido", pedido.id] });
    },
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  const mudar = (campo: keyof DadosExpedicao) => (valor: string) => {
    setD((a) => ({ ...a, [campo]: valor }));
    setSalvo(false);
  };

  const escolhida = (transportadoras ?? []).find((t) => t.id === d.carrierId) ?? null;
  const cepInvalido = (d.cepEntrega ?? "").trim() !== "" && !cepValido(d.cepEntrega);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Expedição</h2>
        <p className="text-sm text-[var(--cor-texto-suave)]">
          Preencha na hora de embalar. Estes campos podem ser alterados mesmo depois de o pedido
          ter sido ganho — e só eles: qualquer valor de dinheiro continua congelado.
        </p>
      </div>

      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {salvo && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">Expedição registrada.</p>}

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

      <div>
        <Label>Observação</Label>
        <textarea
          className="w-full rounded-[0.625rem] border border-[var(--cor-borda)] bg-white px-3 py-2 text-sm"
          rows={2}
          value={d.observacao ?? ""}
          onChange={(e) => mudar("observacao")(e.target.value)}
          placeholder="Sai impressa na ficha do pedido."
        />
      </div>

      <Button disabled={gravar.isPending || cepInvalido} onClick={() => gravar.mutate()}>
        {gravar.isPending ? "Salvando…" : "Salvar expedição"}
      </Button>
    </Card>
  );
}
