import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { toPercent } from "@calc";
import { listarProdutos } from "../lib/db/produtos";
import { memoriaDoProduto, type MemoriaProduto } from "../lib/db/memoria";
import { reais, percentual } from "../lib/format";
import { Card } from "@components/ui/primitives";

// ============================================================
// "Como o custo é formado" (memória de cálculo ponta a ponta)
// ============================================================
//
// Uma tela para responder, com números reais de um produto escolhido, as duas
// perguntas que a planilha nunca respondeu: de onde vem cada dado e como a
// conta é feita. Serve de treinamento para o time e de conferência para o
// Financeiro.
//
// Nenhum cálculo acontece aqui: tudo vem do motor (lib/calculations), pelos
// mesmos caminhos que o simulador e o DRE usam.

const CAMADAS = [
  { n: 1, titulo: "Insumos", resumo: "preço de compra → preço sem imposto" },
  { n: 2, titulo: "Ficha técnica", resumo: "consumo × preço → CMV unitário" },
  { n: 3, titulo: "Rateio da despesa", resumo: "despesa ÷ (produção × fator) → despesa unitária" },
  { n: 4, titulo: "Pedido", resumo: "receita − deduções → margem de contribuição" },
];

export default function ComoECalculadoPage() {
  // Aceita ?produto=<id> para o link "de onde vem?" do simulador cair já na
  // memória do item que a pessoa estava olhando.
  const [params, setParams] = useSearchParams();
  const produtoId = params.get("produto") ?? "";
  const setProdutoId = (id: string) => setParams(id ? { produto: id } : {}, { replace: true });
  const produtosQuery = useQuery({ queryKey: ["produtos"], queryFn: listarProdutos });
  const memoriaQuery = useQuery({
    queryKey: ["memoria", produtoId],
    queryFn: () => memoriaDoProduto(produtoId),
    enabled: Boolean(produtoId),
  });

  const produtos = produtosQuery.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Como o custo é formado</h1>
      <p className="text-sm text-[var(--cor-texto-suave)]">
        O custo de qualquer produto passa por quatro camadas, cada uma usando só o resultado da
        anterior. Escolha um produto para ver a conta com os números de verdade.
      </p>

      <Card className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          {CAMADAS.map((c) => (
            <div key={c.n} className="rounded-lg border border-[var(--cor-borda)] p-3">
              <div className="text-xs font-semibold text-[var(--cor-primaria)]">CAMADA {c.n}</div>
              <div className="font-medium">{c.titulo}</div>
              <div className="mt-1 text-xs text-[var(--cor-texto-suave)]">{c.resumo}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <label className="block text-sm font-medium" htmlFor="produto">
          Produto
        </label>
        <select
          id="produto"
          className="mt-1 w-full rounded-md border border-[var(--cor-borda)] px-3 py-2 text-sm"
          value={produtoId}
          onChange={(e) => setProdutoId(e.target.value)}
        >
          <option value="">Selecione um produto…</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code ? `${p.code} · ` : ""}
              {p.name}
            </option>
          ))}
        </select>
      </Card>

      {memoriaQuery.isLoading && (
        <p className="text-[var(--cor-texto-suave)]">Montando a memória de cálculo…</p>
      )}
      {memoriaQuery.isError && (
        <p className="text-red-600">Não foi possível montar a memória de cálculo deste produto.</p>
      )}
      {memoriaQuery.data === null && (
        <p className="text-[var(--cor-texto-suave)]">Produto não encontrado.</p>
      )}
      {memoriaQuery.data && <Memoria m={memoriaQuery.data} />}
    </div>
  );
}

function Memoria({ m }: { m: MemoriaProduto }) {
  return (
    <div className="space-y-4">
      <Camada n={1} titulo="Insumos — do preço de compra ao preço sem imposto">
        <p className="mb-3 text-sm text-[var(--cor-texto-suave)]">
          A empresa remove os impostos <strong>por fora</strong>: multiplica por (1 − ICMS −
          PIS/COFINS). É o método da planilha, mantido de propósito.
        </p>
        <Rolagem>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
                <th className="py-2 pr-3 font-medium">Insumo</th>
                <th className="py-2 pr-3 font-medium">Compra</th>
                <th className="py-2 pr-3 font-medium text-right">Com imposto</th>
                <th className="py-2 pr-3 font-medium text-right">ICMS</th>
                <th className="py-2 pr-3 font-medium text-right">PIS/COFINS</th>
                <th className="py-2 font-medium text-right">Sem imposto</th>
              </tr>
            </thead>
            <tbody>
              {m.camada1.map((l) => (
                <tr key={l.insumoId} className="border-b border-[var(--cor-borda)] last:border-0">
                  <td className="py-2 pr-3 font-medium">{l.nome}</td>
                  <td className="py-2 pr-3 text-xs text-[var(--cor-texto-suave)]">
                    {l.precoCompra ? `${reais(l.precoCompra)} / ${l.unidadeCompra ?? "un"}` : "—"}
                    {l.fatorConversao && l.fatorConversao !== "1" && (
                      <> × {l.fatorConversao.replace(".", ",")} → {l.unidadeConsumo ?? "un"}</>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">{reais(l.precoComImposto.toString())}</td>
                  <td className="py-2 pr-3 text-right">{percentual(l.icms.toString())}</td>
                  <td className="py-2 pr-3 text-right">{percentual(l.pisCofins.toString())}</td>
                  <td className="py-2 text-right font-semibold">{reais(l.precoSemImposto.toString())}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Rolagem>
      </Camada>

      <Camada n={2} titulo="Ficha técnica — do consumo ao CMV">
        <p className="mb-3 text-sm text-[var(--cor-texto-suave)]">
          A coluna <strong>Consumo</strong> mostra a conta que gerou a quantidade, não só o número
          final — é o que responde “de onde veio 1,212121?” um ano depois.
        </p>
        <Rolagem>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
                <th className="py-2 pr-3 font-medium">Componente</th>
                <th className="py-2 pr-3 font-medium">Consumo</th>
                <th className="py-2 pr-3 font-medium text-right">Quantidade</th>
                <th className="py-2 pr-3 font-medium text-right">Custo unitário</th>
                <th className="py-2 pr-3 font-medium text-right">Custo</th>
                <th className="py-2 font-medium text-right">Peso</th>
              </tr>
            </thead>
            <tbody>
              {m.camada2.linhas.map((l, i) => (
                <tr key={i} className="border-b border-[var(--cor-borda)] last:border-0">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{l.nome}</span>
                    {l.tipo === "produto" && (
                      <span className="ml-1 rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">
                        produto
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <code className="text-xs">{l.expressao}</code>
                    <div className="text-xs text-[var(--cor-texto-suave)]">{l.explicacao}</div>
                  </td>
                  <td className="py-2 pr-3 text-right text-xs">{l.quantidade.toFixed(6)}</td>
                  <td className="py-2 pr-3 text-right">{reais(l.custoUnitario.toString())}</td>
                  <td className="py-2 pr-3 text-right">{reais(l.custo.toString())}</td>
                  <td className="py-2 text-right text-[var(--cor-texto-suave)]">
                    {percentual(l.participacao.toString())}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--cor-borda)]">
                <td className="py-2 font-semibold" colSpan={4}>
                  CMV unitário
                </td>
                <td className="py-2 text-right text-lg font-semibold">
                  {reais(m.camada2.cmv.toString())}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </Rolagem>
      </Camada>

      <Camada n={3} titulo="Rateio da despesa — quanto da despesa fixa cabe a cada unidade">
        {m.camada3 === null ? (
          <p className="text-sm text-[var(--cor-texto-suave)]">
            Este produto não está em nenhum período de alocação aberto, então ainda não tem despesa
            rateada. Abra um período em <Link className="underline" to="/alocacao">Alocação de despesas</Link>.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-[var(--cor-texto-suave)]">
              A despesa unitária depende do fator deste produto <strong>e</strong> do mix de produção
              inteiro: se a produção estimada de qualquer produto muda, a de todos muda junto.
            </p>
            <Passos
              passos={[
                { rotulo: "Peso do produto", conta: `${m.camada3.producaoEstimada.toFixed(0)} (produção) × ${m.camada3.fatorComplexidade.toFixed(0)} (fator)`, valor: m.camada3.peso.toFixed(0) },
                { rotulo: "Participação no total", conta: `${m.camada3.peso.toFixed(0)} ÷ ${m.camada3.somaPesos.toFixed(0)} (soma dos pesos do período)`, valor: toPercent(m.camada3.participacao) + "%" },
                { rotulo: "Despesa alocada", conta: `${reais(m.camada3.totalDespesa.toString())} × ${toPercent(m.camada3.participacao)}%`, valor: reais(m.camada3.despesaAlocada.toString()) },
                { rotulo: "Despesa unitária", conta: `${reais(m.camada3.despesaAlocada.toString())} ÷ ${m.camada3.producaoEstimada.toFixed(0)} unidades`, valor: reais(m.camada3.despesaUnitaria.toString()), destaque: true },
              ]}
            />
          </>
        )}
      </Camada>

      {m.custoTotal && m.camada3 && (
        <Card className="border-l-4 border-l-[var(--cor-primaria)]">
          <h2 className="mb-2 font-semibold">Custo total unitário</h2>
          <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span>CMV {reais(m.camada2.cmv.toString())}</span>
            <span className="text-[var(--cor-texto-suave)]">+</span>
            <span>despesa rateada {reais(m.camada3.despesaUnitaria.toString())}</span>
            <span className="text-[var(--cor-texto-suave)]">=</span>
            <strong className="text-lg">{reais(m.custoTotal.toString())}</strong>
          </div>
          {m.camada3.despesaUnitaria.gt(m.camada2.cmv) && (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              ⚠️ Neste produto a despesa rateada é <strong>maior que o próprio CMV</strong>. O custo
              total é muito sensível ao fator de complexidade, que é um número definido manualmente
              — vale conferir se ainda faz sentido.
            </p>
          )}
        </Card>
      )}

      <Camada n={4} titulo="Pedido — da receita à margem de contribuição">
        <p className="text-sm text-[var(--cor-texto-suave)]">
          A última camada acontece por pedido, porque depende do estado de destino, do canal, do
          frete e da comissão. A cascata completa aparece no{" "}
          <Link className="underline" to="/simulador">Simulador de pedido</Link>, na mesma ordem do DRE:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-[var(--cor-fundo)] p-3 text-xs leading-relaxed">
{`Receita bruta
(−) Impostos sobre venda + DIFAL   = Receita líquida
(−) CMV                            = Lucro bruto
(−) Frete + Comissão               = MARGEM DE CONTRIBUIÇÃO   ← métrica oficial
(−) Despesa rateada (camada 3)     = Resultado após rateio`}
        </pre>
      </Camada>
    </div>
  );
}

function Camada({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-1">
      <div className="text-xs font-semibold text-[var(--cor-primaria)]">CAMADA {n}</div>
      <h2 className="mb-2 text-lg font-semibold">{titulo}</h2>
      {children}
    </Card>
  );
}

// Passos numerados de uma conta, cada um mostrando a operação e o resultado.
function Passos({
  passos,
}: {
  passos: Array<{ rotulo: string; conta: string; valor: string; destaque?: boolean }>;
}) {
  return (
    <ol className="space-y-2">
      {passos.map((p, i) => (
        <li
          key={i}
          className={`flex flex-wrap items-baseline justify-between gap-2 rounded-md px-3 py-2 ${
            p.destaque ? "bg-[var(--cor-fundo)] font-semibold" : ""
          }`}
        >
          <span>
            <span className="mr-2 text-xs text-[var(--cor-texto-suave)]">{i + 1}.</span>
            {p.rotulo}
            <code className="ml-2 text-xs text-[var(--cor-texto-suave)]">{p.conta}</code>
          </span>
          <span className={p.destaque ? "text-lg" : ""}>{p.valor}</span>
        </li>
      ))}
    </ol>
  );
}

function Rolagem({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}
