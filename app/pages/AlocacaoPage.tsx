import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { criarPeriodo, listarPeriodos } from "../lib/db/alocacao";
import { reais } from "../lib/format";
import { Badge, Button, Card, Input, Label } from "@components/ui/primitives";

export function mesLegivel(isoDate: string): string {
  const [ano, mes] = isoDate.split("-");
  const nomes = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${nomes[Number(mes) - 1]} de ${ano}`;
}

export default function AlocacaoPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mes, setMes] = useState("");
  const [total, setTotal] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["periodos"], queryFn: listarPeriodos });

  const criar = useMutation({
    mutationFn: () => criarPeriodo(mes, total),
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["periodos"] });
      navigate(`/alocacao/${id}`);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Erro ao criar período.";
      setErro(/duplicate|unique/i.test(msg) ? "Já existe um período para este mês." : msg);
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Alocação de despesas</h1>
      <p className="text-sm text-[var(--cor-texto-suave)]">
        Cada mês tem seu total de despesa a ratear e as produções estimadas por produto (Decisão D3).
        Meses fechados não são alterados pelo mês corrente.
      </p>

      <Card className="max-w-2xl">
        <h2 className="mb-3 text-lg font-semibold">Novo período mensal</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            if (mes && total) criar.mutate();
          }}
        >
          <div>
            <Label htmlFor="mes">Mês</Label>
            <Input id="mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="total">Despesa total a ratear (R$)</Label>
            <Input id="total" placeholder="ex.: 450000" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
          <Button type="submit" disabled={criar.isPending || !mes || !total}>
            {criar.isPending ? "Criando…" : "Criar período"}
          </Button>
        </form>
        {erro && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      </Card>

      {isLoading && <p className="text-[var(--cor-texto-suave)]">Carregando…</p>}
      {data && data.length > 0 && (
        <Card className="max-w-2xl p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
                <th className="px-4 py-3 font-medium">Período</th>
                <th className="px-4 py-3 font-medium">Total a ratear</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer border-b border-[var(--cor-borda)] last:border-0 hover:bg-[var(--cor-fundo)]"
                  onClick={() => navigate(`/alocacao/${p.id}`)}
                >
                  <td className="px-4 py-3 font-medium">{mesLegivel(p.period)}</td>
                  <td className="px-4 py-3">{reais(p.total_expense)}</td>
                  <td className="px-4 py-3"><Badge>{p.status === "open" ? "Aberto" : "Fechado"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
