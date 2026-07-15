import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { dec } from "@calc";
import { listarPedidos } from "../lib/db/fechamento";
import { listarRegrasMargem } from "../lib/db/configuracoes";
import { statusMargem, type RegraMargem } from "../lib/sim/params";
import { exportarHistoricoPedidos } from "../lib/export/pedidos";
import { dataCurta, reais } from "../lib/format";
import { Badge, Button, Card, Input } from "@components/ui/primitives";

type StatusFiltro = "todos" | "simulation" | "closed" | "cancelled";

export default function PedidosPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusFiltro>("todos");
  const [periodo, setPeriodo] = useState("");
  const [texto, setTexto] = useState("");
  const [uf, setUf] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [canal, setCanal] = useState("");
  const [faixa, setFaixa] = useState("");
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
  }), [todos]);

  const pedidos = useMemo(() => {
    const busca = texto.trim().toLocaleLowerCase("pt-BR");
    return todos.filter((p) => {
      const logico = p.cancelled_at ? "cancelled" : p.status;
      if (status !== "todos" && logico !== status) return false;
      const dataEvento = p.cancelled_at ?? p.closed_at ?? p.created_at;
      if (periodo && !dataEvento.startsWith(periodo)) return false;
      if (uf && p.uf !== uf) return false;
      if (vendedor && p.sellers?.id !== vendedor) return false;
      if (canal && p.channels?.id !== canal) return false;
      const nomesItens = p.order_items.map((i) => i.item_name_snapshot ?? i.products?.name ?? i.kits?.name ?? "").join(" ");
      if (busca && !`${p.customers?.name ?? ""} ${nomesItens}`.toLocaleLowerCase("pt-BR").includes(busca)) return false;
      if (faixa) {
        if (!p.net_revenue_snapshot || !p.contribution_margin_snapshot || dec(p.net_revenue_snapshot).isZero()) return false;
        const regra = statusMargem(dec(p.contribution_margin_snapshot).div(p.net_revenue_snapshot), regras);
        if (regra?.label !== faixa) return false;
      }
      return true;
    });
  }, [todos, status, periodo, texto, uf, vendedor, canal, faixa, regras]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Histórico de pedidos</h1><p className="text-sm text-[var(--cor-texto-suave)]">{pedidos.length} de {todos.length} registro(s)</p></div>
        <Button disabled={exportando || pedidos.length === 0} onClick={async () => {
          setExportando(true); try { await exportarHistoricoPedidos(pedidos); } finally { setExportando(false); }
        }}>{exportando ? "Gerando…" : "Exportar Excel"}</Button>
      </div>

      <Card className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-7">
        <select className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as StatusFiltro)}>
          <option value="todos">Todos os status</option><option value="simulation">Simulações</option>
          <option value="closed">Fechados</option><option value="cancelled">Cancelados</option>
        </select>
        <Input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} title="Período" />
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cliente ou produto/kit" />
        <select className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
          <option value="">Todos vendedores</option>{opcoes.vendedores.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={canal} onChange={(e) => setCanal(e.target.value)}>
          <option value="">Todos canais</option>{opcoes.canais.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={uf} onChange={(e) => setUf(e.target.value)}>
          <option value="">Todas UFs</option>{opcoes.ufs.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={faixa} onChange={(e) => setFaixa(e.target.value)}>
          <option value="">Todas as margens</option>{regras.map((r) => <option key={r.label}>{r.label}</option>)}
        </select>
      </Card>

      {pedidosQuery.isLoading && <p className="text-[var(--cor-texto-suave)]">Carregando…</p>}
      {pedidosQuery.error && <p className="text-red-700">Não foi possível carregar o histórico.</p>}

      {pedidos.length === 0 && !pedidosQuery.isLoading && <Card><p className="text-sm text-[var(--cor-texto-suave)]">Nenhum pedido corresponde aos filtros.</p></Card>}

      {pedidos.length > 0 && <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm"><thead><tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
          <th className="px-4 py-3 font-medium">Data</th><th className="px-4 py-3 font-medium">Cliente</th>
          <th className="px-4 py-3 font-medium">Vendedor / canal</th><th className="px-4 py-3 font-medium">UF</th>
          <th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Receita líquida</th>
          <th className="px-4 py-3 font-medium">Margem contrib.</th>
        </tr></thead><tbody>{pedidos.map((p) => {
          const cancelado = Boolean(p.cancelled_at);
          return <tr key={p.id} className="cursor-pointer border-b border-[var(--cor-borda)] last:border-0 hover:bg-[var(--cor-fundo)]" onClick={() => navigate(`/pedidos/${p.id}`)}>
            <td className="px-4 py-3 text-[var(--cor-texto-suave)]">{dataCurta(p.cancelled_at ?? p.closed_at ?? p.created_at)}</td>
            <td className="px-4 py-3 font-medium">{p.customers?.name ?? "—"}</td>
            <td className="px-4 py-3">{p.sellers?.name ?? "—"}<span className="block text-xs text-[var(--cor-texto-suave)]">{p.channels?.name ?? "—"}</span></td>
            <td className="px-4 py-3">{p.uf ?? "—"}</td>
            <td className="px-4 py-3"><Badge>{cancelado ? `Cancelado ${dataCurta(p.cancelled_at)}` : p.status === "closed" ? `Fechado ${dataCurta(p.closed_at)}` : "Simulação"}</Badge></td>
            <td className="px-4 py-3">{reais(p.totals_display?.receita_liquida)}</td>
            <td className="px-4 py-3">{reais(p.totals_display?.margem_contribuicao)}</td>
          </tr>;
        })}</tbody></table>
      </Card>}
    </div>
  );
}
