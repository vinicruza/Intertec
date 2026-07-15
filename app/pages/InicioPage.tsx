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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Olá, {perfil?.nome}</h1>
          <p className="text-sm text-[var(--cor-texto-suave)]">Visão dos pedidos fechados (custos congelados nos snapshots).</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
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
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <CardNumero titulo="Pedidos fechados" valor={String(dash.cards.pedidosFechados)} />
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

          {dash.cards.pedidosFechados === 0 ? (
            <Card>
              <p className="text-sm text-[var(--cor-texto-suave)]">
                Nenhum pedido fechado {mes ? "neste mês" : "ainda"}. Os rankings aparecem conforme os
                pedidos forem fechados no Simulador.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
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
    <Card className="p-4">
      <div className="text-xs text-[var(--cor-texto-suave)]">{titulo}</div>
      <div className={`mt-1 text-xl font-semibold ${alerta ? "text-red-600" : ""}`}>{valor}</div>
    </Card>
  );
}

function Ranking({ titulo, linhas, colunaExtra }: { titulo: string; linhas: RankingLinha[]; colunaExtra: "margem" | "quantidade" }) {
  return (
    <Card>
      <h2 className="mb-2 text-base font-semibold">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="text-sm text-[var(--cor-texto-suave)]">Sem dados.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
              <th className="py-1.5 font-medium">Nome</th>
              <th className="py-1.5 text-right font-medium">Receita</th>
              <th className="py-1.5 text-right font-medium">{colunaExtra === "margem" ? "Margem" : "Qtd"}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-[var(--cor-borda)] last:border-0">
                <td className="py-1.5 font-medium">{l.nome}</td>
                <td className="py-1.5 text-right">{reais(l.receita.toString())}</td>
                <td className="py-1.5 text-right">
                  {colunaExtra === "margem"
                    ? l.margem ? reais(l.margem.toString()) : "—"
                    : l.quantidade ? formatarQtd(l.quantidade) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function formatarQtd(q: Decimal): string {
  return q.toFixed(0);
}
