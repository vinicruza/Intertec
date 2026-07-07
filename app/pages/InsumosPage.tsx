import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { listarInsumos } from "../lib/db/insumos";
import { reais, dataCurta } from "../lib/format";
import { Button, Card } from "@components/ui/primitives";

export default function InsumosPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({ queryKey: ["insumos"], queryFn: listarInsumos });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Insumos</h1>
        <Link to="/insumos/novo">
          <Button>Novo insumo</Button>
        </Link>
      </div>

      {isLoading && <p className="text-[var(--cor-texto-suave)]">Carregando…</p>}
      {error && <p className="text-red-600">Erro ao carregar insumos.</p>}

      {data && data.length === 0 && (
        <Card>
          <p className="text-[var(--cor-texto-suave)]">
            Nenhum insumo cadastrado ainda. Comece com “Novo insumo”. A carga em massa da planilha
            será feita na importação (Sprint 4/importador).
          </p>
        </Card>
      )}

      {data && data.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Preço c/ imposto</th>
                <th className="px-4 py-3 font-medium">Preço s/ imposto</th>
                <th className="px-4 py-3 font-medium">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {data.map((i) => (
                <tr
                  key={i.id}
                  className="cursor-pointer border-b border-[var(--cor-borda)] last:border-0 hover:bg-[var(--cor-fundo)]"
                  onClick={() => navigate(`/insumos/${i.id}`)}
                >
                  <td className="px-4 py-3 font-medium">{i.name}</td>
                  <td className="px-4 py-3 text-[var(--cor-texto-suave)]">{i.category ?? "—"}</td>
                  <td className="px-4 py-3">{reais(i.price_with_tax)}</td>
                  <td className="px-4 py-3">{reais(i.price_without_tax)}</td>
                  <td className="px-4 py-3 text-[var(--cor-texto-suave)]">{dataCurta(i.price_updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
