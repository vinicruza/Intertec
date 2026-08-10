import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listarEventosMonitoramento, type MonitoramentoEvento } from "../lib/db/monitoramento";
import { listarErrosRecentes } from "../lib/db/observabilidade";
import { dataCurta } from "../lib/format";
import { Badge, Card } from "@components/ui/primitives";

const PERIODOS = [
  { label: "24h", horas: 24 },
  { label: "3 dias", horas: 72 },
  { label: "7 dias", horas: 168 },
];

export default function MonitoramentoPage() {
  const [horas, setHoras] = useState(24);
  const desde = useMemo(() => new Date(Date.now() - horas * 60 * 60 * 1000).toISOString(), [horas]);
  const eventosQuery = useQuery({
    queryKey: ["monitoramentoEventos", desde],
    queryFn: () => listarEventosMonitoramento(desde),
    refetchInterval: 60_000,
  });
  const errosQuery = useQuery({
    queryKey: ["monitoramentoErros"],
    queryFn: listarErrosRecentes,
    refetchInterval: 60_000,
  });

  const eventos = eventosQuery.data ?? [];
  const resumo = useMemo(() => montarResumo(eventos), [eventos]);
  const erros = errosQuery.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cor-destaque)]">Super Admin</div>
          <h1 className="text-2xl font-semibold">Monitoramento</h1>
          <p className="text-sm text-[var(--cor-texto-suave)]">Uso real, velocidade por tela e erros recentes da produção.</p>
        </div>
        <div className="flex gap-2 rounded-xl border border-[var(--cor-borda)] bg-white p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.horas}
              type="button"
              className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${horas === p.horas ? "bg-[var(--cor-primaria)] text-white" : "text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)]"}`}
              onClick={() => setHoras(p.horas)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Numero titulo="Eventos" valor={String(eventos.length)} />
        <Numero titulo="Usuários ativos" valor={String(resumo.usuariosUnicos)} />
        <Numero titulo="Telas vistas" valor={String(resumo.telasUnicas)} />
        <Numero titulo="Erros recentes" valor={String(erros.length)} alerta={erros.length > 0} />
      </div>

      {eventosQuery.isLoading && <p className="text-sm text-[var(--cor-texto-suave)]">Carregando monitoramento…</p>}
      {eventosQuery.error && <p className="text-sm text-red-700">Não foi possível carregar os eventos de monitoramento.</p>}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden p-0">
          <CabecalhoTabela titulo="Telas mais acessadas" subtitulo="Agrupado por rota normalizada." />
          <TabelaRotas linhas={resumo.rotas} />
        </Card>
        <Card className="overflow-hidden p-0">
          <CabecalhoTabela titulo="Ações concluídas" subtitulo="Eventos funcionais registrados pelo sistema." />
          <TabelaEventos linhas={resumo.acoes} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden p-0">
          <CabecalhoTabela titulo="Usuários no período" subtitulo="Quem navegou ou concluiu ações." />
          <TabelaUsuarios linhas={resumo.usuarios} />
        </Card>
        <Card className="overflow-hidden p-0">
          <CabecalhoTabela titulo="Erros recentes" subtitulo="Últimos registros capturados pela interface." />
          {errosQuery.isLoading ? (
            <p className="p-5 text-sm text-[var(--cor-texto-suave)]">Carregando…</p>
          ) : erros.length === 0 ? (
            <p className="p-5 text-sm text-green-700">Nenhum erro registrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
                  <th className="px-5 py-3 font-medium">Data</th><th className="px-5 py-3 font-medium">Usuário</th><th className="px-5 py-3 font-medium">Tela</th><th className="px-5 py-3 font-medium">Mensagem</th>
                </tr></thead>
                <tbody>{erros.map((erro) => (
                  <tr key={erro.id} className="border-b border-[var(--cor-borda)] last:border-0">
                    <td className="px-5 py-3">{dataCurta(erro.occurred_at)}</td>
                    <td className="px-5 py-3">{erro.profiles?.full_name ?? "—"}</td>
                    <td className="px-5 py-3 font-mono text-xs">{erro.path}</td>
                    <td className="max-w-md break-words px-5 py-3 text-red-700">{erro.message}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <CabecalhoTabela titulo="Últimos eventos" subtitulo="Amostra operacional para investigação rápida." />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
              <th className="px-5 py-3 font-medium">Data</th><th className="px-5 py-3 font-medium">Usuário</th><th className="px-5 py-3 font-medium">Evento</th><th className="px-5 py-3 font-medium">Tela</th><th className="px-5 py-3 text-right font-medium">Tempo</th>
            </tr></thead>
            <tbody>{eventos.slice(0, 40).map((evento) => (
              <tr key={evento.id} className="border-b border-[var(--cor-borda)] last:border-0">
                <td className="px-5 py-3">{dataCurta(evento.occurred_at)}</td>
                <td className="px-5 py-3">{evento.profiles?.full_name ?? "—"}</td>
                <td className="px-5 py-3"><Badge>{rotuloEvento(evento.event_type)}</Badge></td>
                <td className="px-5 py-3 font-mono text-xs">{evento.path}</td>
                <td className="px-5 py-3 text-right">{formatarMs(evento.duration_ms)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function montarResumo(eventos: MonitoramentoEvento[]) {
  const usuarios = new Map<string, { nome: string; eventos: number; ultima: string }>();
  const rotas = new Map<string, { path: string; eventos: number; totalMs: number; comTempo: number }>();
  const acoes = new Map<string, { tipo: string; eventos: number; ultima: string }>();

  for (const evento of eventos) {
    const nome = evento.profiles?.full_name ?? "—";
    const atualUsuario = usuarios.get(nome) ?? { nome, eventos: 0, ultima: evento.occurred_at };
    atualUsuario.eventos += 1;
    if (evento.occurred_at > atualUsuario.ultima) atualUsuario.ultima = evento.occurred_at;
    usuarios.set(nome, atualUsuario);

    if (evento.event_type === "page_view") {
      const atualRota = rotas.get(evento.path) ?? { path: evento.path, eventos: 0, totalMs: 0, comTempo: 0 };
      atualRota.eventos += 1;
      if (typeof evento.duration_ms === "number") {
        atualRota.totalMs += evento.duration_ms;
        atualRota.comTempo += 1;
      }
      rotas.set(evento.path, atualRota);
    } else {
      const atualAcao = acoes.get(evento.event_type) ?? { tipo: evento.event_type, eventos: 0, ultima: evento.occurred_at };
      atualAcao.eventos += 1;
      if (evento.occurred_at > atualAcao.ultima) atualAcao.ultima = evento.occurred_at;
      acoes.set(evento.event_type, atualAcao);
    }
  }

  return {
    usuariosUnicos: usuarios.size,
    telasUnicas: rotas.size,
    rotas: [...rotas.values()].sort((a, b) => b.eventos - a.eventos).slice(0, 12),
    acoes: [...acoes.values()].sort((a, b) => b.eventos - a.eventos),
    usuarios: [...usuarios.values()].sort((a, b) => b.eventos - a.eventos),
  };
}

function Numero({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <Card className={`p-5 ${alerta ? "border-red-200 bg-red-50" : ""}`}>
      <div className="text-xs font-medium text-[var(--cor-texto-suave)]">{titulo}</div>
      <div className={`mt-2 text-2xl font-semibold ${alerta ? "text-red-700" : "text-[var(--cor-primaria)]"}`}>{valor}</div>
    </Card>
  );
}

function CabecalhoTabela({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <div className="border-b border-[var(--cor-borda)] px-5 py-4">
      <h2 className="text-base font-semibold">{titulo}</h2>
      <p className="mt-1 text-xs text-[var(--cor-texto-suave)]">{subtitulo}</p>
    </div>
  );
}

function TabelaRotas({ linhas }: { linhas: Array<{ path: string; eventos: number; totalMs: number; comTempo: number }> }) {
  if (linhas.length === 0) return <p className="p-5 text-sm text-[var(--cor-texto-suave)]">Sem navegação registrada.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
          <th className="px-5 py-3 font-medium">Tela</th><th className="px-5 py-3 text-right font-medium">Acessos</th><th className="px-5 py-3 text-right font-medium">Média</th>
        </tr></thead>
        <tbody>{linhas.map((linha) => (
          <tr key={linha.path} className="border-b border-[var(--cor-borda)] last:border-0">
            <td className="px-5 py-3 font-mono text-xs">{linha.path}</td>
            <td className="px-5 py-3 text-right">{linha.eventos}</td>
            <td className="px-5 py-3 text-right">{linha.comTempo ? formatarMs(linha.totalMs / linha.comTempo) : "—"}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function TabelaEventos({ linhas }: { linhas: Array<{ tipo: string; eventos: number; ultima: string }> }) {
  if (linhas.length === 0) return <p className="p-5 text-sm text-[var(--cor-texto-suave)]">Nenhuma ação funcional registrada.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
          <th className="px-5 py-3 font-medium">Ação</th><th className="px-5 py-3 text-right font-medium">Eventos</th><th className="px-5 py-3 text-right font-medium">Última</th>
        </tr></thead>
        <tbody>{linhas.map((linha) => (
          <tr key={linha.tipo} className="border-b border-[var(--cor-borda)] last:border-0">
            <td className="px-5 py-3">{rotuloEvento(linha.tipo)}</td>
            <td className="px-5 py-3 text-right">{linha.eventos}</td>
            <td className="px-5 py-3 text-right">{dataCurta(linha.ultima)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function TabelaUsuarios({ linhas }: { linhas: Array<{ nome: string; eventos: number; ultima: string }> }) {
  if (linhas.length === 0) return <p className="p-5 text-sm text-[var(--cor-texto-suave)]">Sem usuário ativo no período.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
          <th className="px-5 py-3 font-medium">Usuário</th><th className="px-5 py-3 text-right font-medium">Eventos</th><th className="px-5 py-3 text-right font-medium">Última atividade</th>
        </tr></thead>
        <tbody>{linhas.map((linha) => (
          <tr key={linha.nome} className="border-b border-[var(--cor-borda)] last:border-0">
            <td className="px-5 py-3">{linha.nome}</td>
            <td className="px-5 py-3 text-right">{linha.eventos}</td>
            <td className="px-5 py-3 text-right">{dataCurta(linha.ultima)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function formatarMs(valor: number | null): string {
  if (valor == null) return "—";
  if (valor < 1000) return `${Math.round(valor)} ms`;
  return `${(valor / 1000).toFixed(1).replace(".", ",")} s`;
}

function rotuloEvento(tipo: string): string {
  const mapa: Record<string, string> = {
    page_view: "Tela aberta",
    cliente_salvo: "Cliente salvo",
    cotacao_salva: "Cotação salva",
  };
  return mapa[tipo] ?? tipo;
}
