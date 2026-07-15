import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toPercent, type Decimal } from "@calc";
import { montarDashboard, type RankingLinha } from "../lib/sim/dashboard";
import { carregarDadosDashboard } from "../lib/db/dashboard";
import { useAuth } from "../auth/AuthProvider";
import { reais } from "../lib/format";
import { Card, Input } from "@components/ui/primitives";

// Página inicial = Dashboard (PRD §6.9): cards e rankings dos pedidos fechados,
// agregados dos snapshots. Filtro por mês ou todos os períodos.
export default function InicioPage() {
  const { perfil } = useAuth();
  const [mes, setMes] = useState<string>(""); // "" = todos os períodos

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", mes],
    queryFn: () => carregarDadosDashboard(mes || null),
  });

  const dash = useMemo(
    () => (data ? montarDashboard(data.pedidos, data.itens, data.regras) : null),
    [data]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cor-destaque)]">Visão executiva</div>
          <h1 className="text-3xl font-semibold tracking-[-0.035em]">Olá, {perfil?.nome}</h1>
          <p className="mt-1 text-sm text-[var(--cor-texto-suave)]">Acompanhe pedidos fechados, receita e rentabilidade com custos congelados.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[var(--cor-borda)] bg-white p-2 text-sm shadow-sm">
          <span className="text-[var(--cor-texto-suave)]">Período:</span>
          <Input type="month" className="w-44" value={mes} onChange={(e) => setMes(e.target.value)} />
          {mes && (
            <button className="text-xs text-[var(--cor-primaria)] hover:underline" onClick={() => setMes("")}>
              todos
            </button>
          )}
        </div>
      </div>

      {isLoading && <p className="text-[var(--cor-texto-suave)]">Carregando…</p>}

      {dash && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <CardNumero titulo="Pedidos fechados" valor={String(dash.cards.pedidosFechados)} />
            <CardNumero titulo="Cancelamentos" valor={String(dash.cards.cancelamentos)} alerta={dash.cards.cancelamentos > 0} />
            <CardNumero titulo="Receita bruta" valor={reais(dash.cards.receitaBruta.toString())} />
            <CardNumero titulo="Margem de contribuição" valor={reais(dash.cards.margemContribuicao.toString())} />
            <CardNumero
              titulo="Margem média (s/ RL)"
              valor={dash.cards.margemMediaPct ? `${toPercent(dash.cards.margemMediaPct).replace(".", ",")}%` : "—"}
            />
            <CardNumero
              titulo="Crítica/negativa"
              valor={String(dash.cards.pedidosCriticosOuNegativos)}
              alerta={dash.cards.pedidosCriticosOuNegativos > 0}
            />
          </div>

          {dash.cards.pedidosFechados + dash.cards.cancelamentos === 0 ? (
            <Card>
              <p className="text-sm text-[var(--cor-texto-suave)]">
                Nenhum pedido fechado {mes ? "neste mês" : "ainda"}. Os rankings aparecem conforme os
                pedidos forem fechados no Simulador.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 xl:grid-cols-3">
              <Ranking titulo="Top clientes" linhas={dash.rankings.clientes} colunaExtra="margem" />
              <Ranking titulo="Top vendedores" linhas={dash.rankings.vendedores} colunaExtra="margem" />
              <Ranking titulo="Top produtos e kits" linhas={dash.rankings.itens} colunaExtra="quantidade" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CardNumero({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <Card className={`relative overflow-hidden p-5 ${alerta ? "border-red-200" : ""}`}>
      <div className={`absolute inset-x-0 top-0 h-1 ${alerta ? "bg-red-500" : "bg-[var(--cor-primaria)]"}`} />
      <div className="text-xs font-medium leading-5 text-[var(--cor-texto-suave)]">{titulo}</div>
      <div className={`mt-2 text-2xl font-semibold tracking-[-0.025em] ${alerta ? "text-red-600" : "text-[var(--cor-primaria)]"}`}>{valor}</div>
    </Card>
  );
}

function Ranking({ titulo, linhas, colunaExtra }: { titulo: string; linhas: RankingLinha[]; colunaExtra: "margem" | "quantidade" }) {
  return (
    <Card className="overflow-hidden p-0">
      <h2 className="border-b border-[var(--cor-borda)] px-5 py-4 text-base font-semibold">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="p-5 text-sm text-[var(--cor-texto-suave)]">Sem dados.</p>
      ) : (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
              <th className="px-5 py-3 font-medium">Nome</th>
              <th className="px-5 py-3 text-right font-medium">Receita</th>
              <th className="px-5 py-3 text-right font-medium">{colunaExtra === "margem" ? "Margem" : "Qtd"}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-[var(--cor-borda)] last:border-0">
                <td className="px-5 py-3 font-medium">{l.nome}</td>
                <td className="px-5 py-3 text-right">{reais(l.receita.toString())}</td>
                <td className="px-5 py-3 text-right">
                  {colunaExtra === "margem"
                    ? l.margem ? reais(l.margem.toString()) : "—"
                    : l.quantidade ? formatarQtd(l.quantidade) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </Card>
  );
}

function formatarQtd(q: Decimal): string {
  return q.toFixed(0);
}
