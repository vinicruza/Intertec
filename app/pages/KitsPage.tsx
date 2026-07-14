import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { custoKit, type EntradaDecimal } from "@calc";
import { listarKits, type KitLinha } from "../lib/db/kits";
import { listarProdutos } from "../lib/db/produtos";
import { reais } from "../lib/format";
import { Button, Card } from "@components/ui/primitives";

export default function KitsPage() {
  const navigate = useNavigate();
  const kitsQuery = useQuery({ queryKey: ["kits"], queryFn: listarKits });
  const produtosQuery = useQuery({ queryKey: ["produtos"], queryFn: listarProdutos });

  // CMV vigente por produto (de product_costs) para o custo do kit em cascata.
  const custoPorProduto = new Map<string, EntradaDecimal>(
    (produtosQuery.data ?? []).filter((p) => p.cmv !== null).map((p) => [p.id, p.cmv as string])
  );

  function cmvDoKit(kit: KitLinha): string | null {
    try {
      return custoKit(
        kit.kit_items.map((i) => ({ produtoId: i.product_id, quantidade: i.quantity })),
        custoPorProduto
      ).toString();
    } catch {
      return null; // produto do kit sem custo vigente ainda
    }
  }

  const kits = kitsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Kits</h1>
        <Link to="/kits/novo">
          <Button>Novo kit</Button>
        </Link>
      </div>

      {kitsQuery.isLoading && <p className="text-[var(--cor-texto-suave)]">Carregando…</p>}

      {kits.length === 0 && !kitsQuery.isLoading && (
        <Card>
          <p className="text-sm text-[var(--cor-texto-suave)]">
            Nenhum kit ainda. Um kit é uma composição de produtos; a assinatura única impede
            cadastrar duas vezes a mesma composição.
          </p>
        </Card>
      )}

      {kits.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Composição</th>
                <th className="px-4 py-3 font-medium">CMV do kit</th>
              </tr>
            </thead>
            <tbody>
              {kits.map((k) => (
                <tr
                  key={k.id}
                  className="cursor-pointer border-b border-[var(--cor-borda)] last:border-0 hover:bg-[var(--cor-fundo)]"
                  onClick={() => navigate(`/kits/${k.id}`)}
                >
                  <td className="px-4 py-3 text-[var(--cor-texto-suave)]">{k.code}</td>
                  <td className="px-4 py-3 font-medium">{k.name}</td>
                  <td className="px-4 py-3 text-[var(--cor-texto-suave)]">
                    {k.kit_items.map((i) => `${i.quantity}× ${i.products?.name ?? "?"}`).join(" · ")}
                  </td>
                  <td className="px-4 py-3">{reais(cmvDoKit(k))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
