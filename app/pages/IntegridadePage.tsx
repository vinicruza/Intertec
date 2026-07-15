import { useQuery } from "@tanstack/react-query";
import { carregarResumoIntegridade } from "../lib/db/integridade";
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
    </div>
  );
}
