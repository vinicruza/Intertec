import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { custoKitCompleto, type CustoProdutoKit, type EmbalagemKit } from "@calc";
import { listarKits, type KitLinha } from "../lib/db/kits";
import { listarProdutos } from "../lib/db/produtos";
import { reais } from "../lib/format";
import { Card } from "@components/ui/primitives";

export default function KitsPage() {
  const navigate = useNavigate();
  const kitsQuery = useQuery({ queryKey: ["kits"], queryFn: listarKits });
  const produtosQuery = useQuery({ queryKey: ["produtos"], queryFn: listarProdutos });

  // CMV vigente por produto (de product_costs) para o custo do kit em cascata.
  const custoPorProduto = new Map<string, CustoProdutoKit>(
    (produtosQuery.data ?? []).filter((p) => p.cmv !== null).map((p) => [p.id, { cmv: p.cmv as string }])
  );

  // Custo do kit = produtos + embalagem/esterilização consumida uma vez por kit.
  function cmvDoKit(kit: KitLinha): string | null {
    const embalagem: EmbalagemKit[] = kit.kit_packaging.flatMap((e) =>
      e.inputs?.price_without_tax
        ? [{
            nome: e.inputs.name,
            custoUnitario: e.inputs.price_without_tax,
            quantidade: e.quantity,
            maoDeObra: e.inputs.is_labor,
          }]
        : []
    );
    try {
      return custoKitCompleto(
        kit.kit_items.map((i) => ({ produtoId: i.product_id, quantidade: i.quantity })),
        custoPorProduto,
        embalagem
      ).custoTotal.toString();
    } catch {
      return null; // produto do kit sem custo vigente ainda
    }
  }

  const kits = kitsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Kits</h1>
        {/* Reunião 16/07/2026: o kit passa a nascer dentro do pedido; esta tela
            vira o registro de consulta do que já foi criado. */}
        <p className="text-sm text-[var(--cor-texto-suave)]">
          Registro dos kits já criados. Kits novos são montados dentro do{" "}
          <Link className="font-medium underline" to="/simulador">simulador de pedido</Link>, e o
          código oficial nasce quando o pedido é ganho.
        </p>
      </div>

      {kitsQuery.isLoading && <p className="text-[var(--cor-texto-suave)]">Carregando…</p>}

      {kits.length === 0 && !kitsQuery.isLoading && (
        <Card>
          <p className="text-sm text-[var(--cor-texto-suave)]">
            Nenhum kit ainda. Monte o primeiro dentro do simulador de pedido — a assinatura única
            impede que a mesma composição receba dois códigos diferentes.
          </p>
        </Card>
      )}

      {kits.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
                <th className="px-4 py-3 font-medium">Código</th>
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
                  <td className="px-4 py-3">
                    <strong className="font-mono text-base text-[var(--cor-primaria)]">{k.code}</strong>
                    <div className="text-xs text-[var(--cor-texto-suave)]">{k.name}</div>
                    {k.legacy_code && <div className="text-xs text-[var(--cor-texto-suave)]">antigo {k.legacy_code}</div>}
                  </td>
                  <td className="px-4 py-3 text-[var(--cor-texto-suave)]">
                    {k.kit_items.map((i) => `${i.quantity}× ${i.products?.name ?? "?"}`).join(" · ")}
                    {k.kit_packaging.length > 0 && (
                      <div className="mt-1 text-xs">
                        Embalagem: {k.kit_packaging.map((e) => `${e.quantity}× ${e.inputs?.name ?? "?"}`).join(" · ")}
                      </div>
                    )}
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
