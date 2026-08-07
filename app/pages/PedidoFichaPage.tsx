import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { totaisDaFichaDoPedido } from "@calc";
import { obterPedidoCompleto } from "../lib/db/fechamento";
import { podeVerCascataOperacional } from "../lib/db/aprovacao";
import { useAuth } from "../auth/AuthProvider";
import { dataCurta, reais } from "../lib/format";
import { formatarCep, formatarCnpjCpf, formatarTelefone } from "../../lib/cadastro/documentos";
import { Button } from "@components/ui/primitives";

// ============================================================
// Ficha do pedido (reunião Intertech 16/07/2026; formulário 05/08/2026)
// ============================================================
//
// Substitui o papel que hoje é preenchido à mão e vai para a mesa da
// conferência. Segue o formulário que a Intertech já usa — cabeçalho com os
// dados do cliente, itens com valor total por linha, bloco de expedição e
// rodapé com prazo e observação — e traz o que o papel NÃO traz: preço, CMV e
// margem de contribuição, além do kit descrito item por item, porque é dessa
// lista que sai o lançamento no faturamento.
//
// O que ainda NÃO está aqui: o bloco fiscal do formulário (ST, FCP separado e
// o TOTAL a cobrar). O ST não existe no sistema e está para ser confirmado com
// a Intertech; e se DIFAL e FCP são custo da Intertech ou cobrança do cliente
// depende de uma regra por cliente que ainda não foi definida. Enquanto isso,
// os impostos aparecem como o sistema os trata hoje — deduções da receita —,
// com o rótulo dizendo isso em letras, para ninguém ler a folha como fatura.

type ComposicaoKit = Array<{ nome: string; quantidade: string }>;

export default function PedidoFichaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const { data: pedido, isLoading } = useQuery({
    queryKey: ["pedido", id],
    queryFn: () => obterPedidoCompleto(id!),
  });
  const verNumeros = podeVerCascataOperacional(perfil?.perfil);

  // Totais por linha e subtotal saem do motor de cálculo, nunca da tela.
  const totais = useMemo(
    () =>
      totaisDaFichaDoPedido(
        (pedido?.itens ?? []).map((i) => ({ quantidade: i.quantity, precoUnitario: i.unit_price }))
      ),
    [pedido]
  );

  if (isLoading) return <p className="text-[var(--cor-texto-suave)]">Carregando…</p>;
  if (!pedido) return <p className="text-red-600">Pedido não encontrado.</p>;

  const t = pedido.totals_display;
  const fechado = pedido.status === "closed";
  const cliente = pedido.customers;
  // CEP de entrega: o do pedido manda quando existe (entrega excepcional);
  // senão vale o do cadastro. É a única regra de precedência da folha.
  const cepEntrega = pedido.shipping_zip ?? cliente?.shipping_zip ?? null;
  const transportadora = pedido.carriers?.requires_name
    ? pedido.carrier_other ?? "Outra"
    : pedido.carriers?.name ?? null;
  const modoPagamento = pedido.payment_terms?.label ??
    (pedido.payment_term_days != null ? `${pedido.payment_term_days} dias` : null);

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

        {/* ---------- Cabeçalho: os dados do cliente ---------- */}
        <div>
          <h2 className="mb-2 border-b border-black/20 pb-1 font-bold">Cliente</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <Dado rotulo="Empresa" valor={cliente?.name} className="col-span-2" />
            <Dado rotulo="CNPJ/CPF" valor={formatarCnpjCpf(cliente?.tax_id) || null} />
            <Dado rotulo="Data" valor={dataCurta(pedido.created_at)} />
            <Dado rotulo="CEP fat." valor={formatarCep(cliente?.billing_zip) || null} />
            <Dado rotulo="CEP ent." valor={formatarCep(cepEntrega) || null} />
            <Dado rotulo="Contato" valor={cliente?.contact_name} />
            <Dado rotulo="Telefone" valor={formatarTelefone(cliente?.phone) || null} />
            <Dado rotulo="E-mail" valor={cliente?.email} className="col-span-2" />
            <Dado rotulo="UF" valor={pedido.uf} />
            <Dado rotulo="Vendedor" valor={pedido.sellers?.name} />
          </div>
          {/* Endereço de entrega diferente do de sempre precisa saltar aos
              olhos: é o erro de expedição mais caro que existe. */}
          {pedido.shipping_zip && pedido.shipping_zip !== cliente?.shipping_zip && (
            <p className="mt-2 border border-black/40 px-2 py-1 text-xs font-bold">
              ATENÇÃO: a entrega deste pedido vai para o CEP {formatarCep(pedido.shipping_zip)},
              diferente do cadastro do cliente.
            </p>
          )}
        </div>

        {/* ---------- Itens ---------- */}
        <div>
          <h2 className="mb-2 border-b border-black/20 pb-1 font-bold">Itens</h2>
          <table className="w-full">
            <thead>
              <tr className="text-left align-bottom">
                <th className="py-1 font-medium">Código / descrição / nome na NF</th>
                <th className="w-16 py-1 text-right font-medium">Qtd</th>
                <th className="w-24 py-1 text-right font-medium">Valor unit.</th>
                <th className="w-24 py-1 text-right font-medium">Valor total</th>
                {verNumeros && <th className="w-24 py-1 text-right font-medium">CMV un.</th>}
              </tr>
            </thead>
            <tbody>
              {pedido.itens.map((i, idx) => {
                // Kit montado neste pedido só ganha código quando o pedido é
                // ganho — até lá a folha diz isso, em vez de imprimir "—".
                const adHoc = i.ad_hoc_kit_composicao;
                const codigo =
                  i.item_code_snapshot ?? i.products?.code ?? i.kits?.code ??
                  (adHoc ? "kit novo" : "—");
                const nome =
                  i.products?.name ??
                  i.kits?.name ??
                  (adHoc ? i.ad_hoc_kit_label?.trim() || "Kit montado no pedido" : "—");
                // O kit sai DESCRITO ITEM POR ITEM: é dessa lista que sai o
                // lançamento da nota, pedido explícito na reunião. Fechado, sai
                // da composição congelada; em aberto, da composição montada.
                const composicao =
                  (i.kit_composition_snapshot as ComposicaoKit | null) ?? adHoc ?? null;
                return (
                  <tr key={i.id} className="border-t border-black/10 align-top">
                    <td className="py-2">
                      <span className="font-mono font-bold">{codigo}</span> — {nome}
                      {/* Os dois nomes, um embaixo do outro: a conferência
                          reconhece o produto pelo nome de casa (com gramatura),
                          e o faturamento precisa do nome fiscal. */}
                      {i.products?.nf_description && i.products.nf_description !== nome && (
                        <div className="mt-0.5 text-xs">
                          <span className="text-black/50">NF:</span> {i.products.nf_description}
                        </div>
                      )}
                      {composicao && composicao.length > 0 && (
                        <ul className="mt-1 ml-4 list-disc text-xs">
                          {composicao.map((c, j) => (
                            <li key={j}>{c.quantidade}× {c.nome}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="py-2 text-right">{i.quantity}</td>
                    <td className="py-2 text-right">{reais(i.unit_price)}</td>
                    <td className="py-2 text-right font-medium">
                      {reais(totais.linhas[idx]?.total.toString())}
                    </td>
                    {verNumeros && <td className="py-2 text-right">{reais(i.cmv_unit_snapshot)}</td>}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black/40 font-bold">
                <td className="py-2" colSpan={3}>Subtotal</td>
                <td className="py-2 text-right">{reais(totais.subtotal.toString())}</td>
                {verNumeros && <td />}
              </tr>
              {/* Frete destacado já está rateado no preço unitário dos itens. */}
              <tr>
                <td className="py-1" colSpan={3}>
                  Frete
                  {pedido.freight_paid_by_customer && (
                    <span className="ml-1 text-xs font-normal">(destacado nos itens)</span>
                  )}
                </td>
                <td className="py-1 text-right">
                  {reais(pedido.freight)}
                </td>
                {verNumeros && <td />}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ---------- Expedição e condições ---------- */}
        <div>
          <h2 className="mb-2 border-b border-black/20 pb-1 font-bold">Expedição e condições</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <Dado rotulo="Transportadora" valor={transportadora} />
            <Dado rotulo="Pagamento" valor={modoPagamento} />
            <Dado rotulo="Peso" valor={pedido.weight_kg ? `${pedido.weight_kg} kg` : null} />
            <Dado rotulo="Volumes" valor={pedido.volumes != null ? String(pedido.volumes) : null} />
          </div>
          <p className="mt-2">
            <strong>Obs.:</strong>{" "}
            {pedido.order_notes ? (
              <span className="whitespace-pre-line">{pedido.order_notes}</span>
            ) : (
              <span className="inline-block w-2/3 border-b border-black/30" />
            )}
          </p>
        </div>

        {/* ---------- Resumo financeiro (só para quem vê margem) ---------- */}
        {t && verNumeros && (
          <div>
            <h2 className="mb-2 border-b border-black/20 pb-1 font-bold">Resumo financeiro</h2>
            <table className="w-full">
              <tbody>
                <Linha rotulo="Receita bruta" valor={t.receita_bruta} />
                {/* DIFAL em linha própria, e não mais somado a "impostos": o
                    formulário o pede separado, e a conferência precisa
                    enxergá-lo isolado para conversar com o contador. */}
                <Linha rotulo="(−) Impostos sobre venda" valor={t.impostos} />
                <Linha
                  rotulo={`(−) DIFAL${pedido.applies_difal ? "" : " — dispensado (cliente contribuinte)"}`}
                  valor={t.difal}
                />
                <Linha rotulo="(−) Frete" valor={t.frete} />
                <Linha rotulo="(−) Comissão" valor={t.comissao} />
                <Linha rotulo="= Receita líquida" valor={t.receita_liquida} negrito />
                <Linha rotulo="(−) CMV" valor={t.cmv} />
                <Linha rotulo="= Margem de contribuição" valor={t.margem_contribuicao} negrito />
              </tbody>
            </table>
            {/* Sem esta frase, alguém soma as linhas de imposto ao subtotal e
                lê como o que se cobra do cliente. São coisas diferentes —
                confirmado com a Intertech em 05/08/2026: DIFAL é recolhido
                pela Intertech ao estado, não cobrado do cliente. */}
            <p className="mt-2 text-xs">
              Impostos e DIFAL acima são <strong>deduções da receita da Intertech</strong>, não
              valores acrescentados à cobrança do cliente — DIFAL é recolhido pela Intertech ao
              estado quando o cliente não é contribuinte (FCP já incluído na alíquota). O
              tratamento de ST na cobrança ainda está pendente de confirmação com a Intertech.
            </p>
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

// Campo do cabeçalho. Vazio vira uma linha para preencher à mão — a folha
// continua utilizável enquanto o cadastro não estiver completo, que é a
// situação dos 13 mil clientes herdados da planilha.
function Dado({
  rotulo,
  valor,
  className,
}: {
  rotulo: string;
  valor: string | null | undefined;
  className?: string;
}) {
  return (
    <p className={className}>
      <strong>{rotulo}:</strong>{" "}
      {valor ? valor : <span className="inline-block min-w-32 border-b border-black/30" />}
    </p>
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
