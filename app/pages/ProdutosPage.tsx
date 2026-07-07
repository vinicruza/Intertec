import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { listarProdutos } from "../lib/db/produtos";
import { reais } from "../lib/format";
import { Button, Card } from "@components/ui/primitives";

export default function ProdutosPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({ queryKey: ["produtos"], queryFn: listarProdutos });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Produtos e fichas</h1>
        <Link to="/produtos/novo">
          <Button>Novo produto</Button>
        </Link>
      </div>

      {isLoading && <p className="text-[var(--cor-texto-suave)]">Carregando…</p>}
      {error && <p className="text-red-600">Erro ao carregar produtos.</p>}

      {data && data.length === 0 && (
        <Card>
          <p className="text-[var(--cor-texto-suave)]">
            Nenhum produto cadastrado. Crie um em “Novo produto” e monte a ficha técnica. O CMV é
            calculado a partir da ficha — nunca digitado.
          </p>
        </Card>
      )}

      {data && data.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">CMV</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer border-b border-[var(--cor-borda)] last:border-0 hover:bg-[var(--cor-fundo)]"
                  onClick={() => navigate(`/produtos/${p.id}`)}
                >
                  <td className="px-4 py-3 text-[var(--cor-texto-suave)]">{p.code}</td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-[var(--cor-texto-suave)]">{p.category ?? "—"}</td>
                  <td className="px-4 py-3">{reais(p.cmv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
