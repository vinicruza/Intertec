import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import {
  avaliarMargensPendentes,
  listarPedidosPendentesDeAprovacao,
  obterParametrosAprovacao,
  podeAprovar,
  podeVerNumerosDeMargem,
} from "../lib/db/aprovacao";
import { useAuth } from "../auth/AuthProvider";
import { dataCurta, haQuanto, percentual, reais } from "../lib/format";
import { Badge, Button, Card } from "@components/ui/primitives";

// Cores da faixa de margem — mesma régua de Configurações e do simulador
// (SimuladorPage.tsx), para o selo aqui significar a mesma coisa em toda tela.
const CORES: Record<string, string> = {
  green: "bg-green-100 text-green-800",
  yellow: "bg-yellow-100 text-yellow-800",
  orange: "bg-orange-100 text-orange-800",
  red: "bg-red-100 text-red-800",
};

// Fila de quem pode aprovar. Existir aqui foi pedido do cliente: "vai facilitar
// a visualização e deixar o processo mais ágil" — hoje, achar o que está
// pendente exige abrir pedido por pedido no histórico.
//
// O selo de margem em cada linha também foi pedido do cliente: sem ele, dá
// para aprovar um pedido com margem ruim sem perceber, porque a fila só
// mostrava preço — era preciso abrir cada pedido para ver a cascata.
export default function AprovacoesPage() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const paramsQuery = useQuery({ queryKey: ["paramsAprovacao"], queryFn: obterParametrosAprovacao });
  const souAprovador = podeAprovar(perfil?.perfil, paramsQuery.data);
  const verNumeros = podeVerNumerosDeMargem(perfil?.perfil, paramsQuery.data);

  const pedidosQuery = useQuery({
    queryKey: ["pedidosPendentesAprovacao"],
    queryFn: listarPedidosPendentesDeAprovacao,
    enabled: souAprovador,
  });

  const ids = (pedidosQuery.data ?? []).map((p) => p.id);
  const margensQuery = useQuery({
    queryKey: ["margensPendentesAprovacao", ids],
    queryFn: () => avaliarMargensPendentes(ids),
    enabled: souAprovador && ids.length > 0,
  });

  // A tela só existe para quem o próprio parâmetro de Configurações marcou
  // como aprovador — a mesma regra que libera o botão Aprovar/Recusar no
  // pedido. Enquanto os parâmetros carregam, não decide nada ainda.
  if (paramsQuery.isSuccess && !souAprovador) return <Navigate to="/" replace />;

  const pedidos = pedidosQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Aprovações</h1>
        <p className="text-sm text-[var(--cor-texto-suave)]">
          Pedidos aguardando decisão, com a faixa de margem calculada nos custos vigentes — abra o
          pedido para ver a cascata completa antes de decidir.
        </p>
      </div>

      {(paramsQuery.isLoading || pedidosQuery.isLoading) && (
        <p className="text-[var(--cor-texto-suave)]">Carregando…</p>
      )}

      {pedidosQuery.isSuccess && pedidos.length === 0 && (
        <Card>
          <p className="text-sm text-[var(--cor-texto-suave)]">Nenhum pedido aguardando aprovação agora.</p>
        </Card>
      )}

      {pedidos.map((p) => {
        const total = p.order_items.reduce(
          (soma, i) => soma + Number(i.quantity) * Number(i.unit_price),
          0
        );
        const souRemetente = Boolean(perfil?.id) && p.submitted_by === perfil?.id;
        const margem = margensQuery.data?.get(p.id);
        return (
          <div
            key={p.id}
            className="cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/pedidos/${p.id}`)}
            onKeyDown={(e) => { if (e.key === "Enter") navigate(`/pedidos/${p.id}`); }}
          >
            <Card className="flex flex-wrap items-center justify-between gap-3 hover:bg-[var(--cor-fundo)]">
              <div>
                <div className="flex items-center gap-2">
                  <strong className="font-mono text-sm text-[var(--cor-primaria)]">{p.quote_number ?? "—"}</strong>
                  <span className="font-medium">{p.customers?.name ?? "sem cliente"}</span>
                  {souRemetente && <Badge>você enviou</Badge>}
                </div>
                <p className="text-xs text-[var(--cor-texto-suave)]">
                  {p.sellers?.name ?? "—"} · {p.channels?.name ?? "—"} · UF {p.uf ?? "—"} · enviado{" "}
                  {haQuanto(p.submitted_at)} ({dataCurta(p.submitted_at)})
                </p>
              </div>
              <div className="flex items-center gap-3">
                {margensQuery.isLoading && !margem && (
                  <span className="text-xs text-[var(--cor-texto-suave)]">calculando margem…</span>
                )}
                {margem && !margem.ok && (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700" title={margem.erro}>
                    margem indisponível
                  </span>
                )}
                {margem?.ok && margem.regra && (
                  <span className={`rounded-full px-3 py-1 text-sm font-medium ${CORES[margem.regra.color ?? ""] ?? "bg-gray-100 text-gray-800"}`}>
                    {margem.regra.label}{verNumeros ? ` · ${percentual(margem.pct)}` : ""}
                  </span>
                )}
                <span className="text-sm font-semibold">{reais(String(total))}</span>
                <Button
                  className="min-h-9 border border-[var(--cor-borda)] bg-white px-4 text-[var(--cor-primaria)] shadow-none hover:bg-[var(--cor-fundo)]"
                  onClick={(e) => { e.stopPropagation(); navigate(`/pedidos/${p.id}`); }}
                >
                  {souRemetente ? "Ver" : "Ver e decidir"}
                </Button>
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
