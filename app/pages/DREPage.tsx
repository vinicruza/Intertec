import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Decimal, toPercent } from "@calc";
import { montarDRE, type LinhaDRE } from "../lib/sim/dre";
import { obterDespesaReal, pedidosFechadosDoMes, salvarDespesaReal } from "../lib/db/dre";
import { reais } from "../lib/format";
import { Button, Card, Input, Label } from "@components/ui/primitives";

function mesAtual(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function DREPage() {
  const queryClient = useQueryClient();
  const [mes, setMes] = useState(mesAtual());
  const [despesaEdicao, setDespesaEdicao] = useState<string | null>(null);

  const pedidosQuery = useQuery({ queryKey: ["drePedidos", mes], queryFn: () => pedidosFechadosDoMes(mes) });
  const despesaQuery = useQuery({ queryKey: ["dreDespesa", mes], queryFn: () => obterDespesaReal(mes) });

  const dre = useMemo(() => {
    if (!pedidosQuery.data) return null;
    return montarDRE(pedidosQuery.data, despesaQuery.data ?? null);
  }, [pedidosQuery.data, despesaQuery.data]);

  const salvar = useMutation({
    mutationFn: (valor: string) => salvarDespesaReal(mes, valor),
    onSuccess: () => {
      setDespesaEdicao(null);
      queryClient.invalidateQueries({ queryKey: ["dreDespesa", mes] });
    },
  });

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">DRE gerencial mensal</h1>
        <Input type="month" className="w-44" value={mes} onChange={(e) => setMes(e.target.value)} />
      </div>

      <p className="text-sm text-[var(--cor-texto-suave)]">
        Somatório dos <strong>snapshots</strong> dos pedidos fechados no mês — os custos do momento
        de cada venda, nunca recalculados (D7). A despesa da última linha é a despesa fixa{" "}
        <strong>real</strong> do mês, não a soma dos rateios (D3).
      </p>

      {pedidosQuery.isLoading && <p className="text-[var(--cor-texto-suave)]">Carregando…</p>}

      {dre && dre.pedidos === 0 && (
        <Card>
          <p className="text-sm text-[var(--cor-texto-suave)]">
            Nenhum pedido fechado neste mês. O DRE nasce dos fechamentos — simule e feche pedidos
            para vê-lo ganhar corpo.
          </p>
        </Card>
      )}

      {dre && dre.pedidos > 0 && (
        <>
          <Card>
            <p className="mb-3 text-sm text-[var(--cor-texto-suave)]">{dre.pedidos} pedido(s) fechado(s) no mês</p>
            <table className="w-full text-sm">
              <tbody>
                <Linha rotulo="Receita bruta" linha={dre.receitaBruta} />
                <Linha rotulo="(−) Impostos sobre venda + DIFAL" linha={dre.impostosEDifal} negativo />
                <Linha rotulo="= Receita líquida" linha={dre.receitaLiquida} destaque />
                <Linha rotulo="(−) CMV (dos snapshots)" linha={dre.cmv} negativo />
                <Linha rotulo="= Lucro bruto" linha={dre.lucroBruto} destaque />
                <Linha rotulo="(−) Frete líquido + Comissões" linha={dre.freteEComissoes} negativo />
                <Linha rotulo="= MARGEM DE CONTRIBUIÇÃO" linha={dre.margemContribuicao} destaque />
                {dre.despesaFixaReal && <Linha rotulo="(−) Despesa fixa REAL do mês" linha={dre.despesaFixaReal} negativo />}
                {dre.resultadoOperacional && <Linha rotulo="= RESULTADO OPERACIONAL" linha={dre.resultadoOperacional} destaque />}
              </tbody>
            </table>

            {dre.variacaoAbsorcao !== null && (
              <p className="mt-3 rounded-md bg-[var(--cor-fundo)] px-3 py-2 text-sm">
                <strong>Variação de absorção</strong> (Σ rateios {reais(dre.somaRateios.toString())} − despesa real):{" "}
                <span className={dre.variacaoAbsorcao.isNegative() ? "text-red-700" : "text-green-700"}>
                  {reais(dre.variacaoAbsorcao.toString())}
                </span>{" "}
                <span className="text-[var(--cor-texto-suave)]">— informativo: nunca somamos rateios como despesa do mês.</span>
              </p>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 text-lg font-semibold">Despesa fixa real do mês</h2>
            {despesaEdicao === null ? (
              <div className="flex items-center gap-3 text-sm">
                <span>{despesaQuery.data ? reais(despesaQuery.data) : "Ainda não informada pelo Financeiro."}</span>
                <Button className="px-3 py-1 text-xs" onClick={() => setDespesaEdicao(despesaQuery.data ?? "")}>
                  {despesaQuery.data ? "Alterar" : "Informar"}
                </Button>
              </div>
            ) : (
              <form
                className="flex items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (despesaEdicao.trim()) salvar.mutate(despesaEdicao);
                }}
              >
                <div>
                  <Label>Valor (R$)</Label>
                  <Input className="w-44" value={despesaEdicao} onChange={(e) => setDespesaEdicao(e.target.value)} />
                </div>
                <Button type="submit" disabled={salvar.isPending}>Salvar</Button>
                <Button type="button" className="bg-transparent text-[var(--cor-texto-suave)]" onClick={() => setDespesaEdicao(null)}>
                  Cancelar
                </Button>
              </form>
            )}
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Abertura titulo="Por vendedor" linhas={dre.aberturas.porVendedor} />
            <Abertura titulo="Por canal" linhas={dre.aberturas.porCanal} />
          </div>
        </>
      )}
    </div>
  );
}

function Linha({ rotulo, linha, destaque, negativo }: { rotulo: string; linha: LinhaDRE; destaque?: boolean; negativo?: boolean }) {
  return (
    <tr className={destaque ? "border-t border-[var(--cor-borda)] font-semibold" : ""}>
      <td className="py-1.5">{rotulo}</td>
      <td className="py-1.5 text-right">{negativo ? `(${reais(linha.valor.toString())})` : reais(linha.valor.toString())}</td>
      <td className="w-20 py-1.5 text-right text-[var(--cor-texto-suave)]">
        {linha.pct ? `${toPercent(linha.pct).replace(".", ",")}%` : ""}
      </td>
    </tr>
  );
}

function Abertura({ titulo, linhas }: { titulo: string; linhas: Array<{ nome: string; receitaBruta: Decimal; margemContribuicao: Decimal }> }) {
  return (
    <Card>
      <h2 className="mb-2 text-lg font-semibold">{titulo}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
            <th className="py-2 font-medium">{titulo.replace("Por ", "")}</th>
            <th className="py-2 text-right font-medium">Receita bruta</th>
            <th className="py-2 text-right font-medium">Margem contrib.</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.nome} className="border-b border-[var(--cor-borda)] last:border-0">
              <td className="py-2 font-medium">{l.nome}</td>
              <td className="py-2 text-right">{reais(l.receitaBruta.toString())}</td>
              <td className="py-2 text-right">{reais(l.margemContribuicao.toString())}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
