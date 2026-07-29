import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { obterPedidoCompleto } from "../lib/db/fechamento";
import { obterParametrosAprovacao, podeVerNumerosDeMargem } from "../lib/db/aprovacao";
import { useAuth } from "../auth/AuthProvider";
import { dataCurta, reais } from "../lib/format";
import { Button } from "@components/ui/primitives";

// ============================================================
// Ficha do pedido (reunião Intertech 16/07/2026)
// ============================================================
//
// Substitui o papel que hoje é preenchido à mão e vai para a mesa da
// conferência. Traz o que o papel de hoje NÃO traz — preço de venda, CMV e
// margem de contribuição — e o kit descrito item por item, porque é dessa
// lista que sai o lançamento no sistema de faturamento.

type ComposicaoKit = Array<{ nome: string; quantidade: string }>;

export default function PedidoFichaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const { data: pedido, isLoading } = useQuery({
    queryKey: ["pedido", id],
    queryFn: () => obterPedidoCompleto(id!),
  });
  const paramsQuery = useQuery({ queryKey: ["paramsAprovacao"], queryFn: obterParametrosAprovacao });
  const verNumeros = podeVerNumerosDeMargem(perfil?.perfil, paramsQuery.data);

  if (isLoading) return <p className="text-[var(--cor-texto-suave)]">Carregando…</p>;
  if (!pedido) return <p className="text-red-600">Pedido não encontrado.</p>;

  const t = pedido.totals_display;
  const fechado = pedido.status === "closed";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Barra de ações — não sai na impressão. */}
      <div className="flex items-center justify-between print:hidden">
        <Button
          className="bg-transparent text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)]"
          onClick={() => navigate(`/pedidos/${pedido.id}`)}
        >
          Voltar ao pedido
        </Button>
        <Button onClick={() => window.print()}>Imprimir</Button>
      </div>

      <div className="space-y-5 rounded-lg border border-[var(--cor-borda)] bg-white p-8 text-sm text-black print:border-0 print:p-0">
        <div className="flex items-start justify-between border-b border-black/20 pb-3">
          <div>
            <h1 className="text-xl font-bold">Intertech Surgical</h1>
            <p className="text-xs">Ficha do pedido</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-bold">{pedido.quote_number ?? "—"}</p>
            <p className="text-xs">
              {fechado ? `Ganho em ${dataCurta(pedido.closed_at)}` : "Em cotação"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <p><strong>Cliente:</strong> {pedido.customers?.name ?? "—"}</p>
          <p><strong>UF:</strong> {pedido.uf ?? "—"}</p>
          <p><strong>Vendedor:</strong> {pedido.sellers?.name ?? "—"}</p>
          <p><strong>Emissão:</strong> {dataCurta(pedido.created_at)}</p>
        </div>

        <div>
          <h2 className="mb-2 border-b border-black/20 pb-1 font-bold">Itens</h2>
          <table className="w-full">
            <thead>
              <tr className="text-left align-bottom">
                <th className="py-1 font-medium">Código / descrição</th>
                <th className="w-16 py-1 text-right font-medium">Qtd</th>
                <th className="w-24 py-1 text-right font-medium">Preço un.</th>
                {verNumeros && <th className="w-24 py-1 text-right font-medium">CMV un.</th>}
              </tr>
            </thead>
            <tbody>
              {pedido.itens.map((i) => {
                const codigo = i.item_code_snapshot ?? i.products?.code ?? i.kits?.code ?? "—";
                const nome = i.products?.name ?? (i.kits ? i.kits.name : "—");
                // O kit sai DESCRITO ITEM POR ITEM: é dessa lista que sai o
                // lançamento da nota, pedido explícito na reunião.
                const composicao = i.kit_composition_snapshot as ComposicaoKit | null;
                return (
                  <tr key={i.id} className="border-t border-black/10 align-top">
                    <td className="py-2">
                      <span className="font-mono font-bold">{codigo}</span> — {nome}
                      {composicao && composicao.length > 0 && (
                        <ul className="mt-1 ml-4 list-disc text-xs">
                          {composicao.map((c, idx) => (
                            <li key={idx}>{c.quantidade}× {c.nome}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="py-2 text-right">{i.quantity}</td>
                    <td className="py-2 text-right">{reais(i.unit_price)}</td>
                    {verNumeros && <td className="py-2 text-right">{reais(i.cmv_unit_snapshot)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {t && verNumeros && (
          <div>
            <h2 className="mb-2 border-b border-black/20 pb-1 font-bold">Resumo financeiro</h2>
            <table className="w-full">
              <tbody>
                <Linha rotulo="Receita bruta" valor={t.receita_bruta} />
                <Linha rotulo="(−) Impostos + DIFAL" valor={`${t.impostos}`} />
                <Linha rotulo="= Receita líquida" valor={t.receita_liquida} negrito />
                <Linha rotulo="(−) CMV" valor={t.cmv} />
                <Linha rotulo="= Margem de contribuição" valor={t.margem_contribuicao} negrito />
              </tbody>
            </table>
          </div>
        )}

        {!verNumeros && (
          <p className="text-xs italic">
            Os valores de custo e margem constam na via de conferência.
          </p>
        )}

        <div className="grid grid-cols-2 gap-8 pt-8 text-xs">
          <div className="border-t border-black/40 pt-1 text-center">Conferido por</div>
          <div className="border-t border-black/40 pt-1 text-center">
            {pedido.approval_status === "aprovado" ? `Aprovado em ${dataCurta(pedido.approved_at)}` : "Aprovado por"}
          </div>
        </div>
      </div>
    </div>
  );
}

function Linha({ rotulo, valor, negrito }: { rotulo: string; valor?: string; negrito?: boolean }) {
  return (
    <tr className={negrito ? "font-bold" : ""}>
      <td className="py-1">{rotulo}</td>
      <td className="py-1 text-right">{reais(valor)}</td>
    </tr>
  );
}
