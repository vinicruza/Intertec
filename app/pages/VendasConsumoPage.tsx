import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lerRelatorioDeVendas, type ResultadoLeitura } from "../lib/sim/importacaoVendas";
import {
  calcularConsumoDoPeriodo,
  importarVendas,
  listarVendasImportadas,
} from "../lib/db/vendasExternas";
import { mesAtual } from "../lib/periodo";
import { reais } from "../lib/format";
import { Badge, Button, Card, Input, Label } from "@components/ui/primitives";

// ============================================================
// Vendas do ERP e consumo de insumos (reunião Intertech 16/07/2026)
// ============================================================
//
// O faturamento continua no Simples, então o sistema não tem 100% das vendas.
// Aqui entra o relatório por código, que cruzado com o CMV unitário do sistema
// fecha o CMV do mês — e, explodido pela ficha técnica, responde "quanto
// vendemos de laminado".

export default function VendasConsumoPage() {
  const queryClient = useQueryClient();
  const [periodo, setPeriodo] = useState(mesAtual());
  const [texto, setTexto] = useState("");
  const [leitura, setLeitura] = useState<ResultadoLeitura | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const vendasQuery = useQuery({
    queryKey: ["vendasImportadas", periodo],
    queryFn: () => listarVendasImportadas(periodo),
  });
  const consumoQuery = useQuery({
    queryKey: ["consumoPeriodo", periodo],
    queryFn: () => calcularConsumoDoPeriodo(periodo),
  });

  const importar = useMutation({
    mutationFn: () => importarVendas(periodo, leitura!.linhas),
    onSuccess: () => {
      setErro(null);
      setTexto("");
      setLeitura(null);
      queryClient.invalidateQueries({ queryKey: ["vendasImportadas", periodo] });
      queryClient.invalidateQueries({ queryKey: ["consumoPeriodo", periodo] });
    },
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao importar."),
  });

  const vendas = vendasQuery.data ?? [];
  const naoConciliadas = vendas.filter((v) => !v.product_id && !v.kit_id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Vendas do ERP e consumo</h1>
        <p className="text-sm text-[var(--cor-texto-suave)]">
          O faturamento continua no sistema atual, então nem toda venda nasce aqui. Importe o
          relatório de vendas por código: cruzado com o CMV que o sistema calcula, ele fecha o CMV
          do mês e mostra o consumo de cada insumo.
        </p>
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Mês de competência</Label>
            <Input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Relatório de vendas (cole o conteúdo do arquivo)</Label>
          <textarea
            className="h-40 w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 font-mono text-xs"
            value={texto}
            placeholder={"Codigo;Descricao;Quantidade;Valor\nPA0001;Avental GG;4000;16.800,00"}
            onChange={(e) => {
              setTexto(e.target.value);
              setLeitura(e.target.value.trim() ? lerRelatorioDeVendas(e.target.value) : null);
            }}
          />
          <p className="mt-1 text-xs text-[var(--cor-texto-suave)]">
            Aceita ponto e vírgula, vírgula ou tabulação; número em formato brasileiro ou
            americano; cabeçalho opcional.
          </p>
        </div>

        {leitura && (
          <div className="space-y-2">
            <p className="text-sm">
              <strong>{leitura.linhas.length}</strong> linha(s) lida(s)
              {leitura.problemas.length > 0 && (
                <span className="text-amber-800"> · {leitura.problemas.length} com problema</span>
              )}
            </p>
            {leitura.problemas.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-md bg-amber-50 p-3 text-xs text-amber-900">
                {leitura.problemas.map((p) => (
                  <div key={p.linha}>
                    Linha {p.linha}: {p.motivo} <span className="opacity-70">({p.conteudo})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

        <div className="flex items-center gap-3">
          <Button
            disabled={!leitura || leitura.linhas.length === 0 || importar.isPending}
            onClick={() => {
              if (window.confirm(`Importar ${leitura!.linhas.length} linha(s)? As vendas já importadas neste mês serão substituídas.`)) {
                importar.mutate();
              }
            }}
          >
            {importar.isPending ? "Importando…" : "Importar para o mês"}
          </Button>
          <span className="text-xs text-[var(--cor-texto-suave)]">
            Reimportar o mesmo mês substitui o lote anterior — somar duas vezes inventaria receita.
          </span>
        </div>
      </Card>

      {naoConciliadas.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-900">
            <strong>{naoConciliadas.length} código(s) do relatório não encontrado(s) no catálogo.</strong>{" "}
            Eles ficam registrados, mas não entram no consumo — não dá para explodir a composição de
            um produto que o sistema não conhece.
          </p>
          <p className="mt-2 font-mono text-xs text-amber-900">
            {naoConciliadas.slice(0, 20).map((v) => v.source_code).join(", ")}
            {naoConciliadas.length > 20 ? " …" : ""}
          </p>
        </Card>
      )}

      {vendas.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <h2 className="px-4 pt-4 text-lg font-semibold">Vendas importadas</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
                <th className="px-4 py-3 font-medium">Código no relatório</th>
                <th className="px-4 py-3 font-medium">Item no catálogo</th>
                <th className="px-4 py-3 text-right font-medium">Quantidade</th>
                <th className="px-4 py-3 text-right font-medium">Receita</th>
              </tr>
            </thead>
            <tbody>
              {vendas.map((v) => (
                <tr key={v.id} className="border-b border-[var(--cor-borda)] last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{v.source_code}</td>
                  <td className="px-4 py-2">
                    {v.products?.name ?? v.kits?.name ?? <Badge>não conciliado</Badge>}
                  </td>
                  <td className="px-4 py-2 text-right">{v.quantity}</td>
                  <td className="px-4 py-2 text-right">{reais(v.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <div className="px-4 pt-4">
          <h2 className="text-lg font-semibold">Consumo de insumos no mês</h2>
          <p className="text-sm text-[var(--cor-texto-suave)]">
            Cada venda foi explodida pela ficha técnica até o insumo. É assim que se sabe quanto
            saiu de laminado ou de SMS 30g — o insumo não tem código de venda próprio, está dentro
            de vários produtos.
          </p>
        </div>
        {consumoQuery.isLoading && <p className="p-4 text-[var(--cor-texto-suave)]">Calculando…</p>}
        {consumoQuery.error && (
          <p className="p-4 text-sm text-red-700">
            {consumoQuery.error instanceof Error ? consumoQuery.error.message : "Erro ao calcular o consumo."}
          </p>
        )}
        {(consumoQuery.data ?? []).length === 0 && !consumoQuery.isLoading && (
          <p className="p-4 text-sm text-[var(--cor-texto-suave)]">
            Nenhuma venda conciliada neste mês.
          </p>
        )}
        {(consumoQuery.data ?? []).length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
                <th className="px-4 py-3 font-medium">Insumo</th>
                <th className="px-4 py-3 text-right font-medium">Quantidade consumida</th>
                <th className="px-4 py-3 font-medium">Unidade</th>
              </tr>
            </thead>
            <tbody>
              {(consumoQuery.data ?? []).map((c) => (
                <tr key={c.insumoId} className="border-b border-[var(--cor-borda)] last:border-0">
                  <td className="px-4 py-2 font-medium">{c.nome}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {Number(c.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                  </td>
                  <td className="px-4 py-2 text-[var(--cor-texto-suave)]">{c.unidade ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
