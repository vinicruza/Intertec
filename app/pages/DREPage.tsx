import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toPercent } from "@calc";
import { montarDRE, type AberturaDRE, type DRE, type LinhaDRE } from "../lib/sim/dre";
import { dadosDREDoMes, obterDespesaReal, salvarDespesaReal } from "../lib/db/dre";
import { exportarDREExcel } from "../lib/export/dre";
import { mesAnterior } from "../lib/periodo";
import { reais } from "../lib/format";
import { Button, Card, Input, Label } from "@components/ui/primitives";

function mesAtual(): string {
  const partes = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .formatToParts(new Date());
  return `${partes.find((p) => p.type === "year")!.value}-${partes.find((p) => p.type === "month")!.value}`;
}

export default function DREPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [mes, setMes] = useState(mesAtual());
  const [despesaEdicao, setDespesaEdicao] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [erroExportacao, setErroExportacao] = useState<string | null>(null);
  const anterior = mesAnterior(mes);

  const dadosQuery = useQuery({ queryKey: ["dreDados", mes], queryFn: () => dadosDREDoMes(mes) });
  const despesaQuery = useQuery({ queryKey: ["dreDespesa", mes], queryFn: () => obterDespesaReal(mes) });
  const dadosAnterioresQuery = useQuery({ queryKey: ["dreDados", anterior], queryFn: () => dadosDREDoMes(anterior) });
  const despesaAnteriorQuery = useQuery({ queryKey: ["dreDespesa", anterior], queryFn: () => obterDespesaReal(anterior) });

  const dre = useMemo(() => {
    if (!dadosQuery.data) return null;
    return montarDRE(dadosQuery.data.pedidos, despesaQuery.data ?? null, dadosQuery.data.itens);
  }, [dadosQuery.data, despesaQuery.data]);
  const dreAnterior = useMemo(() => {
    if (!dadosAnterioresQuery.data) return null;
    return montarDRE(dadosAnterioresQuery.data.pedidos, despesaAnteriorQuery.data ?? null, dadosAnterioresQuery.data.itens);
  }, [dadosAnterioresQuery.data, despesaAnteriorQuery.data]);

  const salvar = useMutation({
    mutationFn: (valor: string) => salvarDespesaReal(mes, valor),
    onSuccess: () => {
      setDespesaEdicao(null);
      queryClient.invalidateQueries({ queryKey: ["dreDespesa", mes] });
    },
  });

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">DRE realizada mensal</h1>
        <div className="no-print flex flex-wrap gap-2">
          {dre && <Button type="button" disabled={exportando} onClick={async () => {
            setExportando(true); setErroExportacao(null);
            try { await exportarDREExcel(dre, mes); } catch { setErroExportacao("Não foi possível gerar o Excel."); }
            finally { setExportando(false); }
          }}>{exportando ? "Gerando…" : "Exportar Excel"}</Button>}
          <Button type="button" className="bg-slate-600" onClick={() => window.print()}>Imprimir / salvar PDF</Button>
          <Input type="month" className="w-44" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
      </div>
      {erroExportacao && <p className="no-print text-sm text-red-700">{erroExportacao}</p>}

      <p className="text-sm text-[var(--cor-texto-suave)]">
        Esta visão considera exclusivamente pedidos <strong>fechados</strong>. Somatório dos <strong>snapshots</strong> do mês — os custos do momento
        de cada venda, nunca recalculados (D7). A despesa da última linha é a despesa fixa{" "}
        <strong>real</strong> do mês, não a soma dos rateios (D3).
      </p>

      {dadosQuery.isLoading && <p className="text-[var(--cor-texto-suave)]">Carregando…</p>}

      {dre && dre.pedidos === 0 && (
        <Card>
          <p className="text-sm text-[var(--cor-texto-suave)]">
            Nenhum pedido fechado neste mês. Simulações são projeções e não entram na DRE realizada.
          </p>
          <Button className="mt-3" onClick={() => navigate("/pedidos")}>Ver simulações e fechar pedido</Button>
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

          {dreAnterior && <Comparativo atual={dre} anterior={dreAnterior} mesAnterior={anterior} />}

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

          <div className="grid gap-4 lg:grid-cols-2">
            <Abertura titulo="Por vendedor" linhas={dre.aberturas.porVendedor} />
            <Abertura titulo="Por canal" linhas={dre.aberturas.porCanal} />
            <Abertura titulo="Por cliente" linhas={dre.aberturas.porCliente} />
            <Abertura titulo="Por categoria" linhas={dre.aberturas.porCategoria} />
            <Abertura titulo="Por produto e kit" linhas={dre.aberturas.porItem} />
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

function Abertura({ titulo, linhas }: { titulo: string; linhas: AberturaDRE[] }) {
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
            <tr key={l.id} className="border-b border-[var(--cor-borda)] last:border-0">
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

function Comparativo({ atual, anterior, mesAnterior: periodoAnterior }: { atual: DRE; anterior: DRE; mesAnterior: string }) {
  const linhas = [
    ["Receita bruta", atual.receitaBruta.valor, anterior.receitaBruta.valor],
    ["Receita líquida", atual.receitaLiquida.valor, anterior.receitaLiquida.valor],
    ["Margem de contribuição", atual.margemContribuicao.valor, anterior.margemContribuicao.valor],
    ["Resultado operacional", atual.resultadoOperacional?.valor ?? null, anterior.resultadoOperacional?.valor ?? null],
  ] as const;
  return (
    <Card>
      <h2 className="mb-2 text-lg font-semibold">Comparativo com {periodoAnterior}</h2>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
          <th className="py-2">Indicador</th><th className="py-2 text-right">Mês atual</th>
          <th className="py-2 text-right">Mês anterior</th><th className="py-2 text-right">Variação</th>
        </tr></thead>
        <tbody>{linhas.map(([rotulo, valorAtual, valorAnterior]) => {
          const variacao = valorAtual && valorAnterior && !valorAnterior.isZero()
            ? valorAtual.minus(valorAnterior).div(valorAnterior)
            : null;
          return <tr key={rotulo} className="border-b border-[var(--cor-borda)] last:border-0">
            <td className="py-2 font-medium">{rotulo}</td>
            <td className="py-2 text-right">{valorAtual ? reais(valorAtual.toString()) : "—"}</td>
            <td className="py-2 text-right">{valorAnterior ? reais(valorAnterior.toString()) : "—"}</td>
            <td className="py-2 text-right">{variacao ? `${toPercent(variacao).replace(".", ",")}%` : "—"}</td>
          </tr>;
        })}</tbody>
      </table>
    </Card>
  );
}
