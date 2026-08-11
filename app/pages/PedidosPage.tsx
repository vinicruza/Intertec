import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { dec } from "@calc";
import { useAuth } from "../auth/AuthProvider";
import { listarPedidos, type PedidoResumo } from "../lib/db/fechamento";
import { listarRegrasMargem } from "../lib/db/configuracoes";
import { statusMargem, type RegraMargem } from "../lib/sim/params";
import { exportarHistoricoPedidos } from "../lib/export/pedidos";
import { dataCurta, reais } from "../lib/format";
import { Badge, Button, Card, Input } from "@components/ui/primitives";

type StatusFiltro = "todos" | "rascunho" | "pendente" | "aprovado" | "recusado" | "closed" | "lost" | "cancelled";

function statusLogico(p: PedidoResumo): StatusFiltro {
  if (p.cancelled_at) return "cancelled";
  if (p.status === "closed") return "closed";
  if (p.status === "lost") return "lost";
  return p.approval_status ?? "rascunho";
}

function rotuloStatus(p: PedidoResumo): string {
  if (p.cancelled_at) return `Cancelado ${dataCurta(p.cancelled_at)}`;
  if (p.status === "closed") return `Pedido gerado ${dataCurta(p.closed_at)}`;
  if (p.status === "lost") return `Perdida ${dataCurta(p.lost_at)}`;
  if (p.approval_status === "pendente") return "Enviado para aprovação";
  if (p.approval_status === "aprovado") return "Pronto para gerar pedido";
  if (p.approval_status === "recusado") return "Aprovação recusada";
  return "Orçamento em aberto";
}

function receitaLiquidaDoHistorico(p: PedidoResumo): string | null | undefined {
  return p.net_revenue_snapshot ?? p.totals_display?.receita_liquida;
}

function margemContribuicaoDoHistorico(p: PedidoResumo): string | null | undefined {
  return p.contribution_margin_snapshot ?? p.totals_display?.margem_contribuicao;
}

export default function PedidosPage() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const veEquipe = perfil?.perfil === "admin" || perfil?.perfil === "financeiro";
  const [status, setStatus] = useState<StatusFiltro>("todos");
  const [periodo, setPeriodo] = useState("");
  const [texto, setTexto] = useState("");
  const [uf, setUf] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [canal, setCanal] = useState("");
  const [faixa, setFaixa] = useState("");
  const [motivoPerda, setMotivoPerda] = useState("");
  const [segmento, setSegmento] = useState("");
  const [exportando, setExportando] = useState(false);
  const pedidosQuery = useQuery({ queryKey: ["pedidos"], queryFn: listarPedidos });
  const regrasQuery = useQuery({ queryKey: ["marginRules"], queryFn: listarRegrasMargem });
  const todos = pedidosQuery.data ?? [];
  const regras = (regrasQuery.data ?? []) as RegraMargem[];

  const opcoes = useMemo(() => ({
    ufs: [...new Set(todos.map((p) => p.uf).filter(Boolean) as string[])].sort(),
    vendedores: [...new Map(todos.filter((p) => p.sellers).map((p) => [p.sellers!.id, p.sellers!])).values()]
      .sort((a, b) => a.name.localeCompare(b.name)),
    canais: [...new Map(todos.filter((p) => p.channels).map((p) => [p.channels!.id, p.channels!])).values()]
      .sort((a, b) => a.name.localeCompare(b.name)),
    motivos: [...new Map(todos.filter((p) => p.loss_reasons).map((p) => [p.loss_reasons!.id, p.loss_reasons!])).values()]
      .sort((a, b) => a.label.localeCompare(b.label)),
    segmentos: [...new Map(
      todos.filter((p) => p.customers?.customer_types)
        .map((p) => [p.customers!.customer_types!.id, p.customers!.customer_types!])
    ).values()].sort((a, b) => a.name.localeCompare(b.name)),
  }), [todos]);

  const pedidos = useMemo(() => {
    const busca = texto.trim().toLocaleLowerCase("pt-BR");
    return todos.filter((p) => {
      const logico = statusLogico(p);
      if (status !== "todos" && logico !== status) return false;
      const dataEvento = p.cancelled_at ?? p.closed_at ?? p.lost_at ?? p.created_at;
      if (periodo && !dataEvento.startsWith(periodo)) return false;
      if (uf && p.uf !== uf) return false;
      if (vendedor && p.sellers?.id !== vendedor) return false;
      if (canal && p.channels?.id !== canal) return false;
      if (motivoPerda && p.loss_reasons?.id !== motivoPerda) return false;
      if (segmento && p.customers?.customer_types?.id !== segmento) return false;
      // O kit montado no pedido ainda não é kit de catálogo: quem procura por
      // ele digita o rótulo que o vendedor deu, não um nome de produto.
      const nomesItens = p.order_items
        .map((i) => i.item_name_snapshot ?? i.products?.name ?? i.kits?.name ?? i.ad_hoc_kit_label ?? "")
        .join(" ");
      const alvo = `${p.quote_number ?? ""} ${p.order_number ?? ""} ${p.customers?.name ?? ""} ${nomesItens}`;
      if (busca && !alvo.toLocaleLowerCase("pt-BR").includes(busca)) return false;
      if (faixa) {
        const receitaLiquida = receitaLiquidaDoHistorico(p);
        const margemContribuicao = margemContribuicaoDoHistorico(p);
        if (!receitaLiquida || !margemContribuicao || dec(receitaLiquida).isZero()) return false;
        const regra = statusMargem(dec(margemContribuicao).div(receitaLiquida), regras);
        if (regra?.label !== faixa) return false;
      }
      return true;
    });
  }, [todos, status, periodo, texto, uf, vendedor, canal, faixa, motivoPerda, segmento, regras]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Cotações e pedidos</h1><p className="text-sm text-[var(--cor-texto-suave)]">{pedidos.length} de {todos.length} registro(s) — filtre por “Perdidas” para ver o que foi cotado e não vingou</p></div>
        <Button disabled={exportando || pedidos.length === 0} onClick={async () => {
          setExportando(true); try { await exportarHistoricoPedidos(pedidos); } finally { setExportando(false); }
        }}>{exportando ? "Gerando…" : "Exportar Excel"}</Button>
      </div>

      <Card className={`grid gap-3 p-4 md:grid-cols-3 ${veEquipe ? "xl:grid-cols-9" : "xl:grid-cols-7"}`}>
        <select className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as StatusFiltro)}>
          <option value="todos">Todos os status</option><option value="rascunho">Orçamentos em aberto</option>
          <option value="pendente">Enviados para aprovação</option><option value="aprovado">Prontos para gerar pedido</option>
          <option value="recusado">Aprovação recusada</option><option value="closed">Pedidos gerados</option><option value="lost">Perdidas</option>
          <option value="cancelled">Cancelados</option>
        </select>
        <Input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} title="Período" />
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nº do orçamento, pedido, cliente ou item" />
        {veEquipe && (
          <>
            <select className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
              <option value="">Todos vendedores</option>{opcoes.vendedores.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <select className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={canal} onChange={(e) => setCanal(e.target.value)}>
              <option value="">Todos canais</option>{opcoes.canais.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
        )}
        <select className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={uf} onChange={(e) => setUf(e.target.value)}>
          <option value="">Todas UFs</option>{opcoes.ufs.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={faixa} onChange={(e) => setFaixa(e.target.value)}>
          <option value="">Todas as margens</option>{regras.map((r) => <option key={r.label}>{r.label}</option>)}
        </select>
        <select className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={motivoPerda} onChange={(e) => setMotivoPerda(e.target.value)} title="Motivo da perda">
          <option value="">Todos os motivos</option>{opcoes.motivos.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <select className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={segmento} onChange={(e) => setSegmento(e.target.value)} title="Segmento do cliente">
          <option value="">Todos os segmentos</option>{opcoes.segmentos.map((sg) => <option key={sg.id} value={sg.id}>{sg.name}</option>)}
        </select>
      </Card>

      {pedidosQuery.isLoading && <p className="text-[var(--cor-texto-suave)]">Carregando…</p>}
      {pedidosQuery.error && <p className="text-red-700">Não foi possível carregar o histórico.</p>}

      {pedidos.length === 0 && !pedidosQuery.isLoading && <Card><p className="text-sm text-[var(--cor-texto-suave)]">Nenhum pedido corresponde aos filtros.</p></Card>}

      {pedidos.length > 0 && <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm"><thead><tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
          <th className="px-4 py-3 font-medium">Orçamento / pedido</th><th className="px-4 py-3 font-medium">Cliente</th>
          <th className="px-4 py-3 font-medium">Vendedor / canal</th><th className="px-4 py-3 font-medium">UF</th>
          <th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Receita líquida</th>
          <th className="px-4 py-3 font-medium">Margem contrib.</th>
        </tr></thead><tbody>{pedidos.map((p) => {
          return <tr key={p.id} className="cursor-pointer border-b border-[var(--cor-borda)] last:border-0 hover:bg-[var(--cor-fundo)]" onClick={() => navigate(`/pedidos/${p.id}`)}>
            <td className="px-4 py-3">
              <span className="font-mono text-xs">{p.quote_number ?? "—"}</span>
              <span className="block font-mono text-xs text-[var(--cor-texto-suave)]">{p.order_number ?? "—"}</span>
              <span className="block text-xs text-[var(--cor-texto-suave)]">{dataCurta(p.cancelled_at ?? p.closed_at ?? p.lost_at ?? p.created_at)}</span>
            </td>
            <td className="px-4 py-3 font-medium">
              {p.customers?.name ?? "—"}
              {p.customers?.customer_types && (
                <span className="block text-xs text-[var(--cor-texto-suave)]">
                  {p.customers.customer_types.name}
                  {p.customers.customer_specialties ? ` · ${p.customers.customer_specialties.name}` : ""}
                </span>
              )}
            </td>
            <td className="px-4 py-3">{p.sellers?.name ?? "—"}<span className="block text-xs text-[var(--cor-texto-suave)]">{p.channels?.name ?? "—"}</span></td>
            <td className="px-4 py-3">{p.uf ?? "—"}</td>
            <td className="px-4 py-3">
              <Badge>{rotuloStatus(p)}</Badge>
              {p.status === "lost" && p.loss_reasons && (
                <span className="block text-xs text-[var(--cor-texto-suave)]">{p.loss_reasons.label}</span>
              )}
            </td>
            <td className="px-4 py-3">{reais(receitaLiquidaDoHistorico(p))}</td>
            <td className="px-4 py-3">{reais(margemContribuicaoDoHistorico(p))}</td>
          </tr>;
        })}</tbody></table>
      </Card>}
    </div>
  );
}
