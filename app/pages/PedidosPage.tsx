import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listarPedidos } from "../lib/db/fechamento";
import { dataCurta } from "../lib/format";
import { Badge, Card } from "@components/ui/primitives";

export default function PedidosPage() {
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<"todos" | "simulation" | "closed">("todos");
  const { data, isLoading } = useQuery({ queryKey: ["pedidos", filtro], queryFn: () => listarPedidos(filtro) });

  const pedidos = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Histórico de pedidos</h1>
        <select
          className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as typeof filtro)}
        >
          <option value="todos">Todos</option>
          <option value="simulation">Simulações</option>
          <option value="closed">Fechados</option>
        </select>
      </div>

      {isLoading && <p className="text-[var(--cor-texto-suave)]">Carregando…</p>}

      {pedidos.length === 0 && !isLoading && (
        <Card>
          <p className="text-sm text-[var(--cor-texto-suave)]">
            Nenhum pedido aqui ainda. Simulações salvas no Simulador aparecem nesta lista; ao fechar,
            os custos são congelados (snapshot) e o pedido vira definitivo.
          </p>
        </Card>
      )}

      {pedidos.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
                <th className="px-4 py-3 font-medium">Criado</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Vendedor</th>
                <th className="px-4 py-3 font-medium">UF</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Receita líquida</th>
                <th className="px-4 py-3 font-medium">Margem contrib.</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer border-b border-[var(--cor-borda)] last:border-0 hover:bg-[var(--cor-fundo)]"
                  onClick={() => navigate(`/pedidos/${p.id}`)}
                >
                  <td className="px-4 py-3 text-[var(--cor-texto-suave)]">{dataCurta(p.created_at)}</td>
                  <td className="px-4 py-3 font-medium">{p.customers?.name ?? "—"}</td>
                  <td className="px-4 py-3">{p.sellers?.name ?? "—"}</td>
                  <td className="px-4 py-3">{p.uf ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge>{p.status === "closed" ? `Fechado ${dataCurta(p.closed_at)}` : "Simulação"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {p.totals_display?.receita_liquida ? `R$ ${p.totals_display.receita_liquida.replace(".", ",")}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {p.totals_display?.margem_contribuicao ? `R$ ${p.totals_display.margem_contribuicao.replace(".", ",")}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
