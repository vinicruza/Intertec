import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErroCalculoBloqueante, toMoney, type ItemPedido } from "@calc";
import { simular, statusMargem } from "../lib/sim/params";
import {
  carregarContextoSimulador,
  salvarSimulacao,
  type ItemVendavel,
} from "../lib/db/pedidos";
import { reais, percentual } from "../lib/format";
import { Button, Card, Input, Label } from "@components/ui/primitives";

type LinhaItem = { itemId: string; quantidade: string; preco: string };

const CORES: Record<string, string> = {
  green: "bg-green-100 text-green-800",
  yellow: "bg-yellow-100 text-yellow-800",
  orange: "bg-orange-100 text-orange-800",
  red: "bg-red-100 text-red-800",
};

export default function SimuladorPage() {
  const queryClient = useQueryClient();
  const ctxQuery = useQuery({ queryKey: ["ctxSimulador"], queryFn: carregarContextoSimulador });

  const [vendedorId, setVendedorId] = useState("");
  const [uf, setUf] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [clienteNovo, setClienteNovo] = useState("");
  const [comissao, setComissao] = useState<string | null>(null); // null = padrão do canal
  const [frete, setFrete] = useState("0");
  const [freteCliente, setFreteCliente] = useState(false);
  const [linhas, setLinhas] = useState<LinhaItem[]>([{ itemId: "", quantidade: "1", preco: "" }]);
  const [salvo, setSalvo] = useState<string | null>(null);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  const ctx = ctxQuery.data;
  const vendedor = ctx?.vendedores.find((v) => v.id === vendedorId) ?? null;
  const itemPorId = useMemo(
    () => new Map((ctx?.itens ?? []).map((i) => [i.id, i])),
    [ctx?.itens]
  );

  // Simulação ao vivo: monta os itens e chama o motor. Erro bloqueante (CMV
  // zerado, item sem custo) aparece como erro — nunca zero silencioso.
  const simulacao = useMemo(() => {
    if (!ctx || !vendedor || !uf) return { estado: "incompleto" as const };
    const tabela = ctx.tabelaPorUF.get(uf);
    if (!tabela) return { estado: "incompleto" as const };
    const escolhidas = linhas.filter((l) => l.itemId && l.quantidade && l.preco);
    if (escolhidas.length === 0) return { estado: "incompleto" as const };

    try {
      const itens: ItemPedido[] = escolhidas.map((l) => {
        const item = itemPorId.get(l.itemId) as ItemVendavel;
        return {
          nome: item.nome,
          precoVenda: l.preco.trim().replace(",", "."),
          quantidade: l.quantidade.trim().replace(",", "."),
          cmvUnitario: item.cmvUnitario ?? "0", // 0 dispara o erro bloqueante no motor
          despesaUnitaria: item.despesaUnitaria ?? "0",
        };
      });
      const s = simular({
        itens,
        freteManual: frete.trim().replace(",", ".") || "0",
        fretePorContaCliente: freteCliente,
        comissao: comissao ? comissao.trim().replace(",", ".") : null,
        canal: vendedor.regras,
        uf: tabela,
      });
      const semDespesa = escolhidas.some((l) => itemPorId.get(l.itemId)?.despesaUnitaria === null);
      const avisos = semDespesa
        ? [...s.avisos, "Item sem despesa rateada (nenhum período de alocação aberto o inclui) — resultado após rateio incompleto."]
        : s.avisos;
      return { estado: "ok" as const, ...s, avisos };
    } catch (e) {
      if (e instanceof ErroCalculoBloqueante) return { estado: "bloqueado" as const, msg: e.message };
      return { estado: "bloqueado" as const, msg: "Não foi possível calcular." };
    }
  }, [ctx, vendedor, uf, linhas, frete, freteCliente, comissao, itemPorId]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (simulacao.estado !== "ok" || !vendedor) throw new Error("Simulação incompleta.");
      return salvarSimulacao({
        clienteId: clienteId || null,
        clienteNovoNome: clienteId ? null : clienteNovo,
        uf,
        vendedorId: vendedor.id,
        channelId: vendedor.channel_id,
        frete: simulacao.freteUsado.toString(),
        fretePorContaCliente: freteCliente,
        comissao: simulacao.comissaoUsada.toString(),
        itens: linhas
          .filter((l) => l.itemId && l.quantidade && l.preco)
          .map((l) => {
            const item = itemPorId.get(l.itemId) as ItemVendavel;
            return { tipo: item.tipo, refId: item.id, quantidade: l.quantidade, precoVenda: l.preco };
          }),
      });
    },
    onSuccess: (id) => {
      setSalvo(id);
      setErroSalvar(null);
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
    },
    onError: (e: unknown) => setErroSalvar(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  if (ctxQuery.isLoading) return <p className="text-[var(--cor-texto-suave)]">Carregando…</p>;
  if (!ctx) return <p className="text-red-600">Erro ao carregar o simulador.</p>;

  function atualizarLinha(i: number, campo: keyof LinhaItem, valor: string) {
    setLinhas((a) => a.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
    setSalvo(null);
  }

  const freteAutomatico = vendedor?.regras.modeloFrete === "uf_percent";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Simulador de pedido</h1>

      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <Label>Vendedor</Label>
            <select className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={vendedorId} onChange={(e) => { setVendedorId(e.target.value); setComissao(null); }}>
              <option value="">Selecione…</option>
              {ctx.vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.name} — {v.canalNome}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>UF de destino</Label>
            <select className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={uf} onChange={(e) => setUf(e.target.value)}>
              <option value="">—</option>
              {ctx.ufs.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <Label>Cliente</Label>
            <select className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Novo cliente…</option>
              {ctx.clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {!clienteId && (
            <div>
              <Label>Nome do novo cliente</Label>
              <Input value={clienteNovo} onChange={(e) => setClienteNovo(e.target.value)} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <Label>Comissão (fração)</Label>
            <Input
              value={comissao ?? vendedor?.regras.comissaoPadrao ?? ""}
              onChange={(e) => setComissao(e.target.value)}
              placeholder="ex.: 0,025"
            />
            {vendedor && comissao !== null && comissao !== vendedor.regras.comissaoPadrao && (
              <p className="mt-1 text-xs text-amber-700">Override do padrão do canal ({vendedor.regras.comissaoPadrao}) — registrado em auditoria ao fechar.</p>
            )}
          </div>
          <div>
            <Label>Frete (R$)</Label>
            {freteAutomatico ? (
              <p className="rounded-md bg-[var(--cor-fundo)] px-3 py-2 text-sm">
                {simulacao.estado === "ok" ? reais(simulacao.freteUsado.toString()) : "—"} (automático: % da receita por UF)
              </p>
            ) : (
              <Input value={frete} onChange={(e) => setFrete(e.target.value)} />
            )}
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={freteCliente} onChange={(e) => setFreteCliente(e.target.checked)} />
            Frete por conta do cliente
          </label>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Itens</h2>
          <Button type="button" onClick={() => setLinhas((a) => [...a, { itemId: "", quantidade: "1", preco: "" }])}>
            Adicionar item
          </Button>
        </div>
        {linhas.map((l, i) => {
          const item = l.itemId ? itemPorId.get(l.itemId) : undefined;
          return (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <div className="min-w-72 flex-1">
                <Label>Produto ou kit</Label>
                <select className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={l.itemId} onChange={(e) => atualizarLinha(i, "itemId", e.target.value)}>
                  <option value="">Selecione…</option>
                  {ctx.itens.map((it) => <option key={it.id} value={it.id}>{it.codigo} — {it.nome}</option>)}
                </select>
              </div>
              <div><Label>Quantidade</Label><Input className="w-28" value={l.quantidade} onChange={(e) => atualizarLinha(i, "quantidade", e.target.value)} /></div>
              <div><Label>Preço de venda</Label><Input className="w-28" value={l.preco} onChange={(e) => atualizarLinha(i, "preco", e.target.value)} /></div>
              <div className="pb-2 text-xs text-[var(--cor-texto-suave)]">
                {item && (item.cmvUnitario
                  ? <>CMV un.: {reais(item.cmvUnitario)} · Despesa un.: {item.despesaUnitaria ? reais(item.despesaUnitaria) : "—"}</>
                  : <span className="text-red-600">sem custo vigente (bloqueante)</span>)}
              </div>
              <button type="button" className="pb-2 text-xs text-red-600 hover:underline" onClick={() => setLinhas((a) => a.filter((_, idx) => idx !== i))}>
                Remover
              </button>
            </div>
          );
        })}
      </Card>

      {simulacao.estado === "bloqueado" && (
        <p className="rounded-md bg-red-50 px-3 py-3 text-sm text-red-700">🛑 {simulacao.msg}</p>
      )}

      {simulacao.estado === "ok" && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Cascata do pedido</h2>
            {(() => {
              const st = statusMargem(simulacao.resultado.margemContribuicaoPct, ctx.regrasMargem);
              return st ? (
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${CORES[st.color ?? ""] ?? "bg-gray-100 text-gray-800"}`}>
                  {st.label}
                </span>
              ) : null;
            })()}
          </div>

          <table className="w-full text-sm">
            <tbody>
              <LinhaCascata rotulo="Receita bruta" valor={simulacao.resultado.receitaBruta.toString()} />
              <LinhaCascata rotulo="(−) Impostos sobre venda + DIFAL" valor={simulacao.resultado.imposto.plus(simulacao.resultado.difal).negated().toString()} />
              <LinhaCascata rotulo="= Receita líquida (após frete/comissão)" valor={simulacao.resultado.receitaLiquida.toString()} pct="100,00%" destaque />
              <LinhaCascata rotulo="(−) CMV" valor={simulacao.resultado.cmvTotal.negated().toString()} />
              <LinhaCascata
                rotulo="= MARGEM DE CONTRIBUIÇÃO (métrica oficial)"
                valor={simulacao.resultado.margemContribuicao.toString()}
                pct={percentual(simulacao.resultado.margemContribuicaoPct.toString())}
                destaque
              />
              <LinhaCascata rotulo="(−) Despesa alocada (rateio)" valor={simulacao.resultado.despesaTotal.negated().toString()} />
              <LinhaCascata
                rotulo="= Resultado após rateio (informativo)"
                valor={simulacao.resultado.resultadoAposRateio.toString()}
                pct={percentual(simulacao.resultado.resultadoAposRateioPct.toString())}
              />
            </tbody>
          </table>
          <p className="text-xs text-[var(--cor-texto-suave)]">
            Deduções da receita líquida: frete {toMoney(simulacao.freteUsado).replace(".", ",")} · imposto frete{" "}
            {toMoney(simulacao.resultado.impostoFrete).replace(".", ",")} · comissão {toMoney(simulacao.resultado.comissao).replace(".", ",")}
            {simulacao.resultado.ajusteFrete.isZero() ? "" : " · frete devolvido pelo cliente"}
          </p>

          {simulacao.avisos.map((a, i) => (
            <p key={i} className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">⚠️ {a}</p>
          ))}

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando…" : "Salvar simulação"}
            </Button>
            {salvo && <span className="text-sm text-green-700">Simulação salva ✓ (fechamento do pedido: Sprint 11)</span>}
            {erroSalvar && <span className="text-sm text-red-600">{erroSalvar}</span>}
          </div>
        </Card>
      )}
    </div>
  );
}

function LinhaCascata({ rotulo, valor, pct, destaque }: { rotulo: string; valor: string; pct?: string; destaque?: boolean }) {
  return (
    <tr className={destaque ? "font-semibold" : ""}>
      <td className="py-1">{rotulo}</td>
      <td className="py-1 text-right">{reais(valor)}</td>
      <td className="w-24 py-1 text-right text-[var(--cor-texto-suave)]">{pct ?? ""}</td>
    </tr>
  );
}
