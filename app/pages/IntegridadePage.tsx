import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { carregarDetalhesIntegridade, carregarResumoIntegridade } from "../lib/db/integridade";
import { listarErrosRecentes } from "../lib/db/observabilidade";
import { dataCurta } from "../lib/format";
import { Card } from "@components/ui/primitives";

const ITENS = [
  ["products_without_components", "Produtos ativos sem ficha técnica"],
  ["products_without_valid_cmv", "Produtos ativos sem CMV válido"],
  ["empty_kits", "Kits ativos sem itens"],
  ["kit_items_without_cmv", "Itens de kit sem CMV"],
  ["orders_without_items", "Pedidos sem itens"],
  ["closed_orders_without_snapshot", "Pedidos fechados sem snapshot completo"],
  ["customers_without_uf", "Clientes ativos sem UF"],
  ["active_products_without_open_allocation", "Produtos ativos sem alocação no período aberto"],
] as const;

export default function IntegridadePage() {
  const query = useQuery({ queryKey: ["integridade"], queryFn: carregarResumoIntegridade, refetchInterval: 60_000 });
  const errosQuery = useQuery({ queryKey: ["clientErrors"], queryFn: listarErrosRecentes, refetchInterval: 60_000 });
  const detalhesQuery = useQuery({ queryKey: ["integridadeDetalhes"], queryFn: carregarDetalhesIntegridade, refetchInterval: 60_000 });
  if (query.isLoading) return <p className="text-[var(--cor-texto-suave)]">Verificando integridade…</p>;
  if (query.error) return <p className="text-red-700">Não foi possível executar a verificação.</p>;
  const resumo = query.data!;
  const total = ITENS.reduce((s, [campo]) => s + resumo[campo], 0);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Integridade dos dados</h1>
        <p className="text-sm text-[var(--cor-texto-suave)]">Verificações automáticas que podem afetar CMV, fechamento e DRE.</p>
      </div>
      {detalhesQuery.data && (detalhesQuery.data.products_without_components.length > 0 || detalhesQuery.data.products_without_allocation.length > 0) && <div className="grid gap-4 lg:grid-cols-2">
        <Pendencias titulo="Produtos sem ficha técnica" itens={detalhesQuery.data.products_without_components} destino={(id) => `/produtos/${id}`} />
        <Pendencias titulo={`Sem alocação no período ${detalhesQuery.data.open_period ?? "aberto"}`} itens={detalhesQuery.data.products_without_allocation} destino={() => detalhesQuery.data!.open_period_id ? `/alocacao/${detalhesQuery.data!.open_period_id}` : "/alocacao"} />
      </div>}
      <Card className={total ? "border-amber-300 bg-amber-50" : "border-green-300 bg-green-50"}>
        <strong>{total ? `${total} pendência(s) encontrada(s)` : "Nenhuma pendência encontrada"}</strong>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {ITENS.map(([campo, rotulo]) => (
          <Card key={campo} className="flex items-center justify-between p-4">
            <span className="text-sm">{rotulo}</span>
            <span className={`text-xl font-semibold ${resumo[campo] ? "text-amber-700" : "text-green-700"}`}>{resumo[campo]}</span>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Erros recentes da interface</h2>
        {errosQuery.isLoading ? <p className="text-sm text-[var(--cor-texto-suave)]">Carregando…</p>
          : (errosQuery.data?.length ?? 0) === 0 ? <p className="text-sm text-green-700">Nenhum erro registrado.</p>
          : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
            <th className="py-2">Data</th><th className="py-2">Usuário</th><th className="py-2">Tela</th><th className="py-2">Mensagem</th>
          </tr></thead><tbody>{errosQuery.data!.map((erro) => <tr key={erro.id} className="border-b border-[var(--cor-borda)] last:border-0">
            <td className="py-2">{dataCurta(erro.occurred_at)}</td><td className="py-2">{erro.profiles?.full_name ?? "—"}</td>
            <td className="py-2">{erro.path}</td><td className="max-w-md break-words py-2 text-red-700">{erro.message}</td>
          </tr>)}</tbody></table></div>}
      </Card>
    </div>
  );
}

function Pendencias({ titulo, itens, destino }: { titulo: string; itens: Array<{ id: string; code: string; name: string }>; destino: (id: string) => string }) {
  return <Card><h2 className="mb-2 text-lg font-semibold">{titulo}</h2>{itens.length === 0 ? <p className="text-sm text-green-700">Nenhuma pendência.</p>
    : <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">{itens.map((item) => <li key={item.id}>
      <Link className="text-[var(--cor-primaria)] hover:underline" to={destino(item.id)}>{item.code} — {item.name}</Link>
    </li>)}</ul>}</Card>;
}
