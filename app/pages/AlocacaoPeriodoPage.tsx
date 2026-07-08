import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Decimal, calcularAlocacao, somaDosPesos } from "@calc";
import {
  atualizarAlocacao,
  encerrarPeriodo,
  historicoFatores,
  incluirProdutoNoPeriodo,
  listarAlocacoes,
  obterPeriodo,
  removerAlocacao,
  type AlocacaoLinha,
} from "../lib/db/alocacao";
import { listarProdutos } from "../lib/db/produtos";
import { reais, percentual, dataCurta } from "../lib/format";
import { mesLegivel } from "./AlocacaoPage";
import { Badge, Button, Card, Input } from "@components/ui/primitives";

export default function AlocacaoPeriodoPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);

  const periodoQuery = useQuery({ queryKey: ["periodo", id], queryFn: () => obterPeriodo(id!) });
  const alocacoesQuery = useQuery({ queryKey: ["alocacoes", id], queryFn: () => listarAlocacoes(id!) });
  const produtosQuery = useQuery({ queryKey: ["produtos"], queryFn: listarProdutos });
  const historicoQuery = useQuery({ queryKey: ["historicoFator", id], queryFn: () => historicoFatores(id!) });

  const periodo = periodoQuery.data;
  const linhas = alocacoesQuery.data ?? [];
  const aberto = periodo?.status === "open";

  // Memória de cálculo (PRD §6.4): peso, participação, alocada e unitária por
  // produto — calculada pelo motor (fórmulas T4/T5), nunca na tela.
  const memoria = useMemo(() => {
    if (!periodo || linhas.length === 0) return null;
    const pesos = somaDosPesos(
      linhas.map((l) => ({ producaoEstimada: l.estimated_production, fatorComplexidade: l.complexity_factor }))
    );
    if (pesos.lte(0)) return null;
    const porLinha = new Map(
      linhas.map((l) => [
        l.id,
        calcularAlocacao({
          producaoEstimada: l.estimated_production,
          fatorComplexidade: l.complexity_factor,
          totalDespesa: periodo.total_expense,
          somaPesos: pesos,
        }),
      ])
    );
    const somaAlocada = [...porLinha.values()].reduce((s, r) => s.plus(r.despesaAlocada), new Decimal(0));
    return { pesos, porLinha, somaAlocada };
  }, [periodo, linhas]);

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ["alocacoes", id] });
    queryClient.invalidateQueries({ queryKey: ["historicoFator", id] });
  };

  const fechar = useMutation({
    mutationFn: () => encerrarPeriodo(id!, aberto ?? true),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["periodo", id] }),
  });

  if (!periodo) return <p className="text-[var(--cor-texto-suave)]">Carregando…</p>;

  const idsNoPeriodo = new Set(linhas.map((l) => l.product_id));
  const produtosDisponiveis = (produtosQuery.data ?? []).filter((p) => !idsNoPeriodo.has(p.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Alocação — {mesLegivel(periodo.period)}</h1>
          <Badge>{aberto ? "Aberto" : "Fechado"}</Badge>
        </div>
        <div className="flex gap-2">
          <Button
            className="bg-transparent text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)]"
            onClick={() => navigate("/alocacao")}
          >
            Voltar
          </Button>
          <Button onClick={() => fechar.mutate()} disabled={fechar.isPending}>
            {aberto ? "Fechar período" : "Reabrir período"}
          </Button>
        </div>
      </div>

      <p className="text-sm text-[var(--cor-texto-suave)]">
        Total a ratear: <strong>{reais(periodo.total_expense)}</strong>. A despesa unitária de cada
        produto depende do fator dele <em>e</em> do mix inteiro — mudar a produção de um produto
        muda a despesa unitária de todos (Calculations.md §5).
      </p>

      {aberto && (
        <IncluirProduto
          produtos={produtosDisponiveis}
          onIncluir={async (productId, producao, fator) => {
            setErro(null);
            try {
              await incluirProdutoNoPeriodo(id!, productId, producao, fator);
              recarregar();
            } catch (e) {
              setErro(e instanceof Error ? e.message : "Erro ao incluir produto.");
            }
          }}
        />
      )}
      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {linhas.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--cor-texto-suave)]">
            Nenhum produto neste período ainda. Inclua produtos com produção estimada e fator de
            complexidade para ver a memória de cálculo.
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
                <th className="px-3 py-3 font-medium">Produto</th>
                <th className="px-3 py-3 font-medium">Produção</th>
                <th className="px-3 py-3 font-medium">Fator</th>
                <th className="px-3 py-3 font-medium">Peso (prod. × fator)</th>
                <th className="px-3 py-3 font-medium">Participação</th>
                <th className="px-3 py-3 font-medium">Despesa alocada</th>
                <th className="px-3 py-3 font-medium">Despesa unitária</th>
                {aberto && <th className="px-3 py-3" />}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <LinhaAlocacao
                  key={l.id}
                  linha={l}
                  memoria={memoria?.porLinha.get(l.id)}
                  editavel={aberto ?? false}
                  onSalvar={async (producao, fator) => {
                    await atualizarAlocacao(l.id, producao, fator);
                    recarregar();
                  }}
                  onRemover={async () => {
                    await removerAlocacao(l.id);
                    recarregar();
                  }}
                />
              ))}
            </tbody>
            {memoria && (
              <tfoot>
                <tr className="border-t border-[var(--cor-borda)] bg-[var(--cor-fundo)] font-medium">
                  <td className="px-3 py-3">Totais ({linhas.length} produtos)</td>
                  <td className="px-3 py-3" colSpan={2} />
                  <td className="px-3 py-3">{memoria.pesos.toFixed(0)}</td>
                  <td className="px-3 py-3">100%</td>
                  <td className="px-3 py-3">{reais(memoria.somaAlocada.toString())}</td>
                  <td className="px-3 py-3" />
                  {aberto && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Histórico de fatores</h2>
        {(historicoQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-[var(--cor-texto-suave)]">Nenhuma alteração de fator registrada neste período.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
                <th className="py-2 font-medium">Quando</th>
                <th className="py-2 font-medium">Produto</th>
                <th className="py-2 font-medium">Fator (antes → depois)</th>
              </tr>
            </thead>
            <tbody>
              {(historicoQuery.data ?? []).map((h) => (
                <tr key={h.id} className="border-b border-[var(--cor-borda)] last:border-0">
                  <td className="py-2 text-[var(--cor-texto-suave)]">{dataCurta(h.changed_at)}</td>
                  <td className="py-2">{h.expense_allocations?.products?.name ?? "—"}</td>
                  <td className="py-2">{h.old_factor ?? "—"} → {h.new_factor ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function LinhaAlocacao({
  linha,
  memoria,
  editavel,
  onSalvar,
  onRemover,
}: {
  linha: AlocacaoLinha;
  memoria: ReturnType<typeof calcularAlocacao> | undefined;
  editavel: boolean;
  onSalvar: (producao: string, fator: string) => Promise<void>;
  onRemover: () => Promise<void>;
}) {
  const [producao, setProducao] = useState(linha.estimated_production);
  const [fator, setFator] = useState(linha.complexity_factor);
  const [salvando, setSalvando] = useState(false);
  const alterado = producao !== linha.estimated_production || fator !== linha.complexity_factor;

  return (
    <tr className="border-b border-[var(--cor-borda)] last:border-0">
      <td className="px-3 py-2 font-medium">{linha.products?.name ?? "—"}</td>
      <td className="px-3 py-2">
        {editavel ? <Input className="w-28" value={producao} onChange={(e) => setProducao(e.target.value)} /> : producao}
      </td>
      <td className="px-3 py-2">
        {editavel ? <Input className="w-20" value={fator} onChange={(e) => setFator(e.target.value)} /> : fator}
      </td>
      <td className="px-3 py-2">{memoria ? memoria.peso.toFixed(0) : "—"}</td>
      <td className="px-3 py-2">{memoria ? percentual(memoria.participacao.toString()) : "—"}</td>
      <td className="px-3 py-2">{memoria ? reais(memoria.despesaAlocada.toString()) : "—"}</td>
      <td className="px-3 py-2">{memoria ? reais(memoria.despesaUnitaria.toString()) : "—"}</td>
      {editavel && (
        <td className="px-3 py-2 text-right">
          {alterado && (
            <Button
              className="px-2 py-1 text-xs"
              disabled={salvando}
              onClick={async () => {
                setSalvando(true);
                try {
                  await onSalvar(producao, fator);
                } finally {
                  setSalvando(false);
                }
              }}
            >
              Salvar
            </Button>
          )}
          <button type="button" className="ml-2 text-xs text-red-600 hover:underline" onClick={() => void onRemover()}>
            Remover
          </button>
        </td>
      )}
    </tr>
  );
}

function IncluirProduto({
  produtos,
  onIncluir,
}: {
  produtos: Array<{ id: string; name: string }>;
  onIncluir: (productId: string, producao: string, fator: string) => Promise<void>;
}) {
  const [productId, setProductId] = useState("");
  const [producao, setProducao] = useState("");
  const [fator, setFator] = useState("");

  return (
    <Card>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!productId || !producao || !fator) return;
          await onIncluir(productId, producao, fator);
          setProductId("");
          setProducao("");
          setFator("");
        }}
      >
        <div className="min-w-64">
          <label className="mb-1 block text-sm font-medium">Produto</label>
          <select
            className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Selecione…</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Produção estimada</label>
          <Input className="w-36" placeholder="ex.: 20000" value={producao} onChange={(e) => setProducao(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Fator de complexidade</label>
          <Input className="w-36" placeholder="ex.: 70" value={fator} onChange={(e) => setFator(e.target.value)} />
        </div>
        <Button type="submit" disabled={!productId || !producao || !fator}>Incluir</Button>
      </form>
    </Card>
  );
}
