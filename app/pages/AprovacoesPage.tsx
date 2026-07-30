import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { listarPedidosPendentesDeAprovacao, obterParametrosAprovacao, podeAprovar } from "../lib/db/aprovacao";
import { useAuth } from "../auth/AuthProvider";
import { dataCurta, haQuanto, reais } from "../lib/format";
import { Badge, Button, Card } from "@components/ui/primitives";

// Fila de quem pode aprovar. Existir aqui foi pedido do cliente: "vai facilitar
// a visualização e deixar o processo mais ágil" — hoje, achar o que está
// pendente exige abrir pedido por pedido no histórico.
export default function AprovacoesPage() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const paramsQuery = useQuery({ queryKey: ["paramsAprovacao"], queryFn: obterParametrosAprovacao });
  const souAprovador = podeAprovar(perfil?.perfil, paramsQuery.data);

  const pedidosQuery = useQuery({
    queryKey: ["pedidosPendentesAprovacao"],
    queryFn: listarPedidosPendentesDeAprovacao,
    enabled: souAprovador,
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
          Pedidos aguardando decisão. Preço, CMV e margem só aparecem depois de abrir o pedido.
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
