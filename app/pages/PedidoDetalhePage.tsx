import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { cancelarPedido, duplicarPedido, fecharPedido, obterPedidoCompleto, reabrirPedido } from "../lib/db/fechamento";
import { useAuth } from "../auth/AuthProvider";
import { dataCurta, reais } from "../lib/format";
import { Badge, Button, Card, Input } from "@components/ui/primitives";

// Detalhe do pedido. Para pedido FECHADO, tudo vem do snapshot congelado —
// nada é recalculado (D7). Simulações mostram os itens e oferecem o fechamento.
export default function PedidoDetalhePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { perfil } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");

  const { data: pedido, isLoading } = useQuery({
    queryKey: ["pedido", id],
    queryFn: () => obterPedidoCompleto(id!),
  });

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ["pedido", id] });
    queryClient.invalidateQueries({ queryKey: ["pedidos"] });
    queryClient.invalidateQueries({ queryKey: ["dreDados"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const fechar = useMutation({
    mutationFn: () => fecharPedido(id!),
    onSuccess: recarregar,
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

  if (isLoading) return <p className="text-[var(--cor-texto-suave)]">Carregando…</p>;
  if (!pedido) return <p className="text-red-600">Pedido não encontrado.</p>;

  const fechado = pedido.status === "closed";
  const cancelado = Boolean(pedido.cancelled_at);
  const t = pedido.totals_display;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Pedido — {pedido.customers?.name ?? "sem cliente"}</h1>
          <Badge>{cancelado ? `Cancelado em ${dataCurta(pedido.cancelled_at)}` : fechado ? `Fechado em ${dataCurta(pedido.closed_at)}` : "Simulação"}</Badge>
        </div>
        <Button className="bg-transparent text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)]" onClick={() => navigate("/pedidos")}>
          Voltar
        </Button>
      </div>

      <Card className="space-y-1 text-sm">
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

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Qtd</th>
              <th className="px-4 py-3 font-medium">Preço</th>
              <th className="px-4 py-3 font-medium">CMV un. {fechado ? "(congelado)" : "(vigente ao fechar)"}</th>
            </tr>
          </thead>
          <tbody>
            {pedido.itens.map((i) => (
              <tr key={i.id} className="border-b border-[var(--cor-borda)] last:border-0">
                <td className="px-4 py-3 font-medium">
                  {i.products?.name ?? (i.kits ? `[Kit] ${i.kits.name}` : "—")}
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
                <td className="px-4 py-3">{reais(i.cmv_unit_snapshot)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {fechado && t && (
        <Card className="space-y-1">
          <h2 className="mb-2 text-lg font-semibold">Cascata congelada</h2>
          <table className="w-full text-sm">
            <tbody>
              <Linha rotulo="Receita bruta" valor={t.receita_bruta} />
              <Linha rotulo="(−) Impostos + DIFAL" valor={`${t.impostos} + ${t.difal}`} />
              <Linha rotulo="= Receita líquida" valor={t.receita_liquida} destaque />
              <Linha rotulo="(−) CMV" valor={t.cmv} />
              <Linha rotulo="= MARGEM DE CONTRIBUIÇÃO" valor={t.margem_contribuicao} destaque />
              <Linha rotulo="(−) Despesa alocada (rateio)" valor={t.despesa_alocada} />
              <Linha rotulo="= Resultado após rateio (informativo)" valor={t.resultado_apos_rateio} />
            </tbody>
          </table>
        </Card>
      )}

      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      <div className="flex gap-2">
        {!fechado && !cancelado && (
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
