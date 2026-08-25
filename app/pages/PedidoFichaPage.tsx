import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { dec, difalNoBlocoComercial, margemPct, totaisDaFichaDoPedido, totalACobrarDoCliente } from "@calc";
import { calcularCascataVigente, nomeDoUsuario, obterPedidoCompleto } from "../lib/db/fechamento";
import {
  obterParametrosAprovacao,
  podeVerCascataOperacional,
  podeVerNumerosDeMargem,
} from "../lib/db/aprovacao";
import { PARAMETROS_APROVACAO_PADRAO } from "../lib/sim/aprovacao";
import { seloMargemComercial } from "../lib/sim/params";
import { useAuth } from "../auth/AuthProvider";
import { dataCurta, percentual, reais } from "../lib/format";
import { formatarCep, formatarCnpjCpf, formatarTelefone } from "../../lib/cadastro/documentos";
import { Button } from "@components/ui/primitives";
import { IntertechLogo } from "@components/brand/IntertechLogo";

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
// O bloco fiscal do formulário já sai com valor no DIFAL (24/08/2026, §12.4):
// quem monta o pedido precisa enxergar o imposto que o estado de destino cobra.
// Continua sendo dedução da receita da Intertech, nunca cobrança do cliente
// (§12.1) — quem diz isso é a nota do rodapé do bloco, e o TOTAL não soma o
// DIFAL, para ninguém ler a folha como fatura. Sem valor segue só o FCP, que
// não tem número próprio: já vem embutido na alíquota final do DIFAL (§7.2).
// O ST saiu da folha em 24/08/2026 — o imposto não se aplica mais (§12.2).
//
// A folha também é onde sai o selo de faixa da margem (§12.5): é ela que vai
// para a mesa da conferência e responde "em que situação este pedido foi
// aprovado".

type ComposicaoKit = Array<{ nome: string; quantidade: string }>;

export default function PedidoFichaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const { data: pedido, isLoading } = useQuery({
    queryKey: ["pedido", id],
    queryFn: () => obterPedidoCompleto(id!),
  });
  // Quem aprovou, para a assinatura da ficha. Consulta à parte porque a
  // política de `profiles` não deixa a vendedora ler o perfil de quem aprovou.
  const { data: aprovadoPor } = useQuery({
    queryKey: ["nomeUsuario", pedido?.approved_by],
    queryFn: () => nomeDoUsuario(pedido?.approved_by ?? null),
    enabled: Boolean(pedido?.approved_by),
  });
  const cascataQuery = useQuery({
    queryKey: ["cascataVigente", id],
    queryFn: () => calcularCascataVigente(id!),
    enabled: Boolean(pedido) && pedido?.status === "simulation" && pedido.itens.length > 0,
  });
  const verNumeros = podeVerCascataOperacional(perfil?.perfil);
  // O selo de faixa sai para todo mundo — é a informação que o pedido da
  // Intertech (24/08/2026) pediu na folha. O PERCENTUAL é que respeita a
  // configuração que esconde número de margem do comercial: enquanto os
  // parâmetros não chegam, vale o padrão, que esconde.
  const { data: parametrosAprovacao } = useQuery({
    queryKey: ["parametrosAprovacao"],
    queryFn: obterParametrosAprovacao,
  });
  const verPercentualDaMargem = podeVerNumerosDeMargem(
    perfil?.perfil,
    parametrosAprovacao ?? PARAMETROS_APROVACAO_PADRAO
  );

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
  const cascata = cascataQuery.data;
  const totaisFinanceiros = fechado ? t : cascata?.ok ? cascata.totals : t;
  // Destaque do DIFAL (Calculations.md §7.2.1). Pedido fechado usa o que ficou
  // congelado no fechamento; pedido em cotação usa o destaque vigente da UF.
  // Fechado ANTES de 25/08/2026 não tem o congelado — cai no vigente, que é o
  // comportamento que a folha já tinha.
  const difalDestacado = fechado
    ? (pedido.difal_destacado_snapshot ?? (cascata?.ok ? cascata.difalDestacado : false))
    : cascata?.ok
      ? cascata.difalDestacado
      : false;
  const cliente = pedido.customers;
  const codigoCliente = cliente?.external_code?.trim();
  // CEP de entrega: o do pedido manda quando existe (entrega excepcional);
  // senão vale o do cadastro. É a única regra de precedência da folha.
  const cepEntrega = pedido.shipping_zip ?? cliente?.shipping_zip ?? null;
  // Cidade/UF de entrega, em três degraus: o que foi digitado NESTE pedido
  // manda; senão, quando o CEP é o mesmo do cadastro, vale o cadastro; e só
  // então sobra a UF sozinha — caso em que quem avisa da entrega diferente é a
  // tarja de ATENÇÃO logo abaixo.
  //
  // `pedido.uf` é a UF FISCAL (base do DIFAL) e entra aqui só como último
  // recurso: ela não é, por definição, a UF do endereço de entrega.
  const entregaIgualAoCadastro =
    !pedido.shipping_zip || pedido.shipping_zip === cliente?.shipping_zip;
  const cidadeEntrega =
    pedido.shipping_city ?? (entregaIgualAoCadastro ? cliente?.shipping_city ?? null : null);
  const ufEntrega =
    pedido.shipping_state ??
    (entregaIgualAoCadastro ? cliente?.shipping_state ?? pedido.uf : pedido.uf);
  const transportadora = pedido.carriers?.requires_name
    ? pedido.carrier_other ?? "Outra"
    : pedido.carriers?.name ?? null;
  const fretesCotados = pedido.freight_quotes ?? [];
  const modoPagamento = pedido.payment_terms?.label ??
    (pedido.payment_term_days != null ? `${pedido.payment_term_days} dias` : null);
  const impressoEm = formatarDataHora(new Date());

  const titulo = pedido.order_number ? `PEDIDO ${pedido.order_number}` : "ORÇAMENTO";
  const subtitulo = pedido.order_number
    ? `ORÇAMENTO ${pedido.quote_number ?? "—"}`
    : pedido.quote_number ?? "—";
  const totalACobrar = totalACobrarDoCliente(totais.subtotal, pedido.freight ?? "0");

  // ---------- Selo da faixa de margem (pedido da Intertech, 24/08/2026) ----------
  //
  // A folha vai para a mesa da conferência e é ela que responde "em que
  // situação este pedido foi aprovado". A regra de faixa já existia
  // (`seloMargemComercial`, PRD §5.5) e já aparecia na tela do pedido; só nunca
  // tinha chegado ao papel. Mesma classificação, mesmo cálculo — nada de
  // margem muda aqui.
  const margemDoPedido = totaisFinanceiros?.margem_contribuicao;
  const receitaLiquidaDoPedido = totaisFinanceiros?.receita_liquida;
  const pctMargem =
    margemDoPedido && receitaLiquidaDoPedido
      ? margemPct(dec(margemDoPedido), dec(receitaLiquidaDoPedido))
      : null;
  const selo = pctMargem ? seloMargemComercial(pctMargem) : null;

  // ---------- DIFAL na folha (pedido da vendedora, 24/08/2026) ----------
  //
  // Até aqui esta linha saía com traço fixo, e o valor do DIFAL só existia no
  // bloco "Margem — uso interno", que é admin. A vendedora, que é quem monta o
  // pedido, não via o número em lugar nenhum — daí a reclamação de que a
  // cotação "não está puxando o valor do DIFAL". O sistema estava calculando o
  // tempo todo; era a folha que não mostrava.
  //
  // O que muda aqui é SÓ a folha imprimir o que o motor já calcula. A regra
  // fiscal não muda: o DIFAL continua sendo custo da Intertech, não cobrança do
  // cliente (Calculations.md §12.1), então o TOTAL segue sendo subtotal + frete
  // — travado em `totalACobrarDoCliente`, com teste.
  //
  // FCP não ganha número próprio: já vem embutido na alíquota final da tabela
  // `difal_rates` (§7.2), e o sistema nunca calculou os dois separados. Por isso
  // "DIFAL + FCP" repete o valor do DIFAL, e quem explica onde o FCP está é a
  // nota do rodapé do bloco.
  // ---------- Destacado e não destacado (regra da Intertech, 25/08/2026) ----
  //
  // O DIFAL sai da margem em toda UF que tenha alíquota — isso não é opcional e
  // está no bloco "Margem — uso interno", que é o que bate com a planilha de
  // Rentabilidade. O que a chave por UF decide é só ESTE bloco, o comercial:
  //
  //   destacado     → o número aparece; é imposto que a Intertech já recolhe
  //   não destacado → não aparece número; a cobrança não está acontecendo
  //                   agora, e a folha não pode sugerir que está
  //
  // Em nenhum dos dois casos o TOTAL muda: DIFAL nunca foi cobrança do cliente
  // (§12.1), e o TOTAL segue sendo subtotal + frete, travado com teste.
  const difalNaFolha = difalNoBlocoComercial({
    destacado: difalDestacado,
    valor: totaisFinanceiros?.difal != null ? reais(totaisFinanceiros.difal) : null,
    calculando: !fechado && cascataQuery.isLoading,
  }).texto;

  return (
    // 190mm, não 210mm: a folha é A4 (210mm) MENOS os 10mm de margem de cada
    // lado do `@page` (app/index.css). Com 210mm o navegador tinha de encolher
    // ou cortar, e cortava — o último dígito do número do pedido e a ponta
    // direita das linhas de baixo sumiam na impressão.
    <div className="mx-auto max-w-[190mm] space-y-4">
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

      <div className="ficha-pedido space-y-4 rounded-xl border border-[var(--cor-borda)] bg-white p-8 text-[11px] leading-snug text-black shadow-[var(--sombra-cartao)] print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {/* ---------- Cabeçalho ---------- */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <IntertechLogo size="lg" className="h-16 [&_img]:h-16" />
          {/* Selo da faixa no meio da faixa superior: é o primeiro dado que
              quem confere procura na folha. */}
          <div className="justify-self-center">
            {selo && (
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-bold ${CORES_DO_SELO[selo.color]}`}
              >
                <span className="h-2.5 w-2.5 rounded-full bg-current" />
                {selo.label}
                {verPercentualDaMargem && pctMargem && ` · ${percentual(pctMargem.toString())}`}
              </span>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold leading-none tracking-tight text-[var(--cor-primaria)]">
              {titulo}
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--cor-primaria)]">{subtitulo}</p>
            <p className="mt-2 text-[10px] text-black/60">
              {fechado ? `Pedido gerado em ${dataCurta(pedido.closed_at)}` : "Orçamento em aberto"}
            </p>
            <p className="text-[10px] text-black/60">Impresso em {impressoEm}</p>
          </div>
        </div>
        <div className="mt-1 mb-3 h-[3px] rounded-full bg-[var(--cor-primaria)]" />

        {/* ---------- Dados da empresa / cliente ---------- */}
        <section className="ficha-bloco">
          <Secao titulo="Dados da empresa / cliente" icone={<IconePessoa />} />
          {/* Uma linha por assunto, e não duas colunas independentes: o CNPJ e
              o código do cliente sobem para a linha do nome (são identificação
              da mesma empresa), e cada CEP fica ao lado da sua cidade. O campo
              "Data" saiu — repetia o "Pedido gerado em" do cabeçalho. */}
          <div className="rounded-xl border border-[var(--cor-borda)] px-4 py-2">
            <LinhaDeDados>
              <Par rotulo="Empresa" valor={cliente?.name} className="min-w-0 flex-1" />
              <Par rotulo="Cód. cliente" valor={codigoCliente ?? null} className="w-32 shrink-0" />
              <Par rotulo="CNPJ/CPF" valor={formatarCnpjCpf(cliente?.tax_id) || null} className="w-44 shrink-0" />
            </LinhaDeDados>
            <LinhaDeDados>
              <Par rotulo="CEP fat." valor={formatarCep(cliente?.billing_zip) || null} className="w-1/2" larguraRotulo="w-28" />
              <Par rotulo="Cidade/UF fat." valor={cidadeUf(cliente?.billing_city, cliente?.billing_state)} className="w-1/2" larguraRotulo="w-32" />
            </LinhaDeDados>
            <LinhaDeDados>
              <Par rotulo="CEP entrega" valor={formatarCep(cepEntrega) || null} className="w-1/2" larguraRotulo="w-28" />
              <Par rotulo="Cidade/UF entrega" valor={cidadeUf(cidadeEntrega, ufEntrega)} className="w-1/2" larguraRotulo="w-32" />
            </LinhaDeDados>
            <LinhaDeDados>
              <Par rotulo="Contato" valor={cliente?.contact_name} className="w-1/2" larguraRotulo="w-28" />
              <Par rotulo="Telefone" valor={formatarTelefone(cliente?.phone) || null} className="w-1/2" larguraRotulo="w-32" />
            </LinhaDeDados>
            <LinhaDeDados ultima>
              <Par rotulo="E-mail" valor={cliente?.email} className="w-1/2" larguraRotulo="w-28" />
              <Par rotulo="Vendedor" valor={pedido.sellers?.name} className="w-1/2" larguraRotulo="w-32" />
            </LinhaDeDados>
          </div>
          {/* Endereço de entrega diferente do de sempre precisa saltar aos
              olhos: é o erro de expedição mais caro que existe. */}
          {pedido.shipping_zip && pedido.shipping_zip !== cliente?.shipping_zip && (
            <p className="mt-2 rounded-lg border border-black/40 bg-amber-50 px-3 py-1.5 text-[10px] font-bold">
              ATENÇÃO: a entrega deste pedido vai para o CEP {formatarCep(pedido.shipping_zip)},
              diferente do cadastro do cliente.
            </p>
          )}
        </section>

        {/* ---------- Itens ---------- */}
        <section className="ficha-bloco">
          <Secao titulo="Itens do pedido" icone={<IconeDocumento />} />
          <div className="overflow-hidden rounded-xl border border-[var(--cor-borda)]">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--cor-primaria)] text-[10px] font-semibold uppercase tracking-wide text-white">
                  <th className="w-20 px-3 py-2 text-left">Código</th>
                  <th className="px-3 py-2 text-left">Descrição</th>
                  <th className="w-14 px-2 py-2 text-center">Qtde</th>
                  <th className="w-24 px-3 py-2 text-center">Valor unit.</th>
                  <th className="w-24 px-3 py-2 text-center">Valor total</th>
                  {verNumeros && <th className="w-20 px-3 py-2 text-center">CMV un.</th>}
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
                  // Kit sai SÓ com o código na folha impressa (pedido da
                  // Intertech em 21/08/2026). O nome interno — "KIT HOSP SANTA
                  // BEATRIZ" — não diz nada a quem confere e a quem fatura: quem
                  // descreve o kit é a lista de componentes logo abaixo, que é de
                  // onde sai o lançamento da nota. O código fica, que é como o
                  // kit é encontrado no sistema.
                  const ehKit = Boolean(i.kits || adHoc);
                  // O kit sai DESCRITO ITEM POR ITEM: é dessa lista que sai o
                  // lançamento da nota, pedido explícito na reunião. Fechado, sai
                  // da composição congelada; em aberto, da composição montada.
                  const composicao =
                    (i.kit_composition_snapshot as ComposicaoKit | null) ?? adHoc ?? null;
                  return (
                    <tr key={i.id} className="border-t border-[var(--cor-borda)] align-middle">
                      <td className="px-3 py-2 align-top font-mono text-[10px] font-semibold">{codigo}</td>
                      <td className="px-3 py-2 align-top">
                        {!ehKit && <div className="font-semibold">{nome}</div>}
                        {/* Os dois nomes, um embaixo do outro: a conferência
                            reconhece o produto pelo nome de casa (com gramatura),
                            e o faturamento precisa do nome fiscal. */}
                        {i.products?.nf_description && i.products.nf_description !== nome && (
                          <div className="text-[10px] italic text-black/70">
                            <span className="font-semibold not-italic">NF:</span>{" "}
                            {i.products.nf_description}
                          </div>
                        )}
                        {composicao && composicao.length > 0 && (
                          <ul className="mt-1 ml-3 list-disc text-[10px] text-black/75">
                            {composicao.map((c, j) => (
                              <li key={j}>{c.quantidade}× {c.nome}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center align-top">{i.quantity}</td>
                      <td className="px-3 py-2 text-center align-top">{reais(i.unit_price)}</td>
                      <td className="px-3 py-2 text-center align-top font-semibold">
                        {reais(totais.linhas[idx]?.total.toString())}
                      </td>
                      {verNumeros && (
                        <td className="px-3 py-2 text-center align-top text-black/70">
                          {reais(fechado ? i.cmv_unit_snapshot : cascata?.ok ? cascata.cmvPorItem.get(i.id) ?? null : i.cmv_unit_snapshot)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------- Expedição + Resumo financeiro, lado a lado ---------- */}
        <div className="grid grid-cols-[7fr_5fr] gap-4">
          <section className="ficha-bloco">
            <Secao titulo="Expedição / logística" icone={<IconeCaminhao />} />
            {fretesCotados.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-[var(--cor-borda)]">
                <table className="w-full table-fixed text-[9px]">
                  <thead>
                    <tr className="bg-[var(--cor-primaria)] font-semibold text-white">
                      <th className="w-12 px-1 py-1.5">Escolhida</th>
                      <th className="px-1 py-1.5">Transportadora</th>
                      <th className="w-24 px-1 py-1.5">Cód. cotação</th>
                      <th className="w-20 px-1 py-1.5">Valor</th>
                      <th className="w-12 px-1 py-1.5">Prazo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fretesCotados.map((opcao) => (
                      <tr
                        key={opcao.id}
                        className={`border-t border-[var(--cor-borda)] text-center ${opcao.selected ? "font-semibold" : ""}`}
                      >
                        <td className="px-1 py-1.5">
                          <Selecao marcada={opcao.selected} />
                        </td>
                        <td className="truncate px-1 py-1.5">{opcao.carrierName || "—"}</td>
                        <td className="truncate px-1 py-1.5">{opcao.carrierOther || opcao.quoteCode || "—"}</td>
                        <td className="whitespace-nowrap px-1 py-1.5">{opcao.amount ? reais(opcao.amount) : "—"}</td>
                        <td className="whitespace-nowrap px-1 py-1.5">
                          {opcao.leadTimeDays ? `${opcao.leadTimeDays}d` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* Transportadora escolhida sem cotação lançada: a folha ainda
                precisa dizer por quem vai. */}
            {fretesCotados.length === 0 && (
              <div className="rounded-xl border border-[var(--cor-borda)] px-4 py-2">
                <Campo rotulo="Transportadora" valor={transportadora} ultimo />
              </div>
            )}
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Caixinha rotulo="Peso (kg)" valor={pedido.weight_kg ? String(pedido.weight_kg) : null} />
              <Caixinha rotulo="Volumes" valor={pedido.volumes != null ? String(pedido.volumes) : null} />
              {/* Só ocupa espaço na folha quando alguém escreveu: pedido sem
                  composição não ganha uma caixinha vazia. */}
              {pedido.volumes_composition && (
                <Caixinha rotulo="Composição" valor={pedido.volumes_composition} />
              )}
              <Caixinha rotulo="CEP de entrega" valor={formatarCep(cepEntrega) || null} />
            </div>
          </section>

          <section className="ficha-bloco">
            <Secao titulo="Resumo financeiro" icone={<IconeCifrao />} />
            <div className="overflow-hidden rounded-xl border border-[var(--cor-borda)]">
              <table className="w-full">
                <tbody>
                  <LinhaResumo rotulo="Subtotal" valor={reais(totais.subtotal.toString())} />
                  <LinhaResumo rotulo="Frete" valor={reais(pedido.freight)} />
                  {/* Valor à vista, mas fora do TOTAL: nenhum deles é
                      acrescentado à cobrança do cliente (§12.1). O que explica
                      isso é a nota do rodapé do bloco, não texto no meio da
                      linha: o texto entre parênteses empurrava o valor para
                      fora da coluna e deixava "DIFAL + FCP" sem número. */}
                  <LinhaResumo
                    rotulo={pedido.applies_difal ? "DIFAL" : "DIFAL dispensado"}
                    valor={difalNaFolha}
                  />
                  <LinhaResumo rotulo="FCP" valor="—" />
                  <LinhaResumo rotulo="DIFAL + FCP" valor={difalNaFolha} />
                  <tr className="bg-[var(--cor-primaria-clara)]">
                    <td className="px-4 py-2 text-base font-bold text-[var(--cor-primaria)]">TOTAL:</td>
                    <td className="px-4 py-2 text-right text-base font-extrabold text-[var(--cor-primaria)]">
                      {reais(totalACobrar.toString())}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[9px] leading-tight text-black/55">
              Total = subtotal dos itens + frete. Impostos, DIFAL e FCP não entram na cobrança do
              cliente: são deduções da receita da Intertech. O FCP já vem embutido na alíquota do
              DIFAL, por isso não tem valor próprio e “DIFAL + FCP” repete o valor do DIFAL.
              {!difalDestacado && (
                <>
                  {" "}
                  <strong>Não destacado</strong> nesta UF: o estado não está cobrando o DIFAL neste
                  momento, então ele não sai destacado na nota — mas continua deduzido da margem no
                  bloco de uso interno, porque a cobrança pode vir a qualquer momento.
                </>
              )}
            </p>
          </section>
        </div>

        {/* ---------- Pagamento e observação ---------- */}
        <section className="ficha-bloco rounded-xl border border-[var(--cor-borda)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--cor-primaria)]">
            Pagamento:{" "}
            <span className="font-normal normal-case tracking-normal text-black">
              {modoPagamento ?? ""}
            </span>
          </p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--cor-primaria)]">
            Obs.:{" "}
            <span className="font-normal normal-case tracking-normal text-black">
              {pedido.order_notes ? (
                <span className="whitespace-pre-line">{pedido.order_notes}</span>
              ) : (
                ""
              )}
            </span>
          </p>
        </section>

        {/* ---------- Margem (só para quem pode ver) ---------- */}
        {totaisFinanceiros && verNumeros && (
          <section className="ficha-bloco">
            <Secao titulo="Margem — uso interno" icone={<IconeCifrao />} />
            {!fechado && cascataQuery.isLoading && (
              <p className="mb-1 text-[10px] text-black/60">Calculando valores financeiros vigentes…</p>
            )}
            {!fechado && cascata && !cascata.ok && (
              <p className="mb-1 rounded-lg border border-black/20 px-2 py-1 text-[10px]">
                Não foi possível calcular a cascata vigente: {cascata.erro}
              </p>
            )}
            <div className="overflow-hidden rounded-xl border border-[var(--cor-borda)]">
              <table className="w-full">
                <tbody>
                  <Linha rotulo="Receita bruta" valor={totaisFinanceiros.receita_bruta} />
                  {/* DIFAL em linha própria, e não somado a "impostos": a
                      conferência precisa enxergá-lo isolado para conversar com
                      o contador. */}
                  <Linha rotulo="(−) Impostos sobre venda" valor={totaisFinanceiros.impostos} />
                  <Linha
                    rotulo={`(−) DIFAL${pedido.applies_difal ? "" : " — dispensado (cliente contribuinte)"}`}
                    valor={totaisFinanceiros.difal}
                  />
                  {/* O frete deduzido, não o cotado: quando o cliente paga o
                      transporte nada sai da receita, e a linha tem de mostrar
                      zero para a cascata fechar. */}
                  <Linha
                    rotulo={`(−) Frete${pedido.freight_paid_by_customer ? " — por conta do cliente" : ""}`}
                    valor={totaisFinanceiros.frete_deduzido}
                  />
                  {/* O imposto sobre o frete faltava aqui até 25/08/2026: a folha
                      listava cinco das seis deduções e a receita líquida impressa
                      não fechava com as linhas acima dela. */}
                  <Linha rotulo="(−) Imposto sobre o frete" valor={totaisFinanceiros.imposto_frete} />
                  <Linha rotulo="(−) Comissão" valor={totaisFinanceiros.comissao} />
                  <Linha rotulo="= Receita líquida" valor={totaisFinanceiros.receita_liquida} negrito />
                  <Linha rotulo="(−) CMV" valor={totaisFinanceiros.cmv} />
                  <Linha rotulo="= Margem de contribuição" valor={totaisFinanceiros.margem_contribuicao} negrito />
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="grid grid-cols-2 gap-10 pt-6 text-[10px]">
          <div className="border-t border-black/40 pt-1 text-center">Conferido por</div>
          <div className="border-t border-black/40 pt-1 text-center">
            {pedido.approval_status === "aprovado"
              ? `Aprovado por ${aprovadoPor ?? "—"} em ${dataCurta(pedido.approved_at)}`
              : "Aprovado por"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Peças do desenho da ficha ----------

// Cores do selo de faixa, as mesmas da tela do pedido — quem confere o papel e
// quem olha a tela precisam ver o mesmo verde.
const CORES_DO_SELO: Record<string, string> = {
  blue: "border-blue-300 bg-blue-100 text-blue-800",
  green: "border-green-300 bg-green-100 text-green-800",
  yellow: "border-yellow-300 bg-yellow-100 text-yellow-800",
  red: "border-red-300 bg-red-100 text-red-800",
};

// Uma linha do cartão de cliente, com um ou mais pares rótulo/valor.
function LinhaDeDados({ children, ultima }: { children: React.ReactNode; ultima?: boolean }) {
  return (
    <div className={`flex gap-x-4 py-1.5 ${ultima ? "" : "border-b border-[var(--cor-borda)]"}`}>
      {children}
    </div>
  );
}

// Par rótulo/valor. Vazio vira espaço para preencher à mão — a folha continua
// utilizável enquanto o cadastro não estiver completo, que é a situação dos 13
// mil clientes herdados da planilha.
function Par({
  rotulo,
  valor,
  className,
  larguraRotulo,
}: {
  rotulo: string;
  valor: string | null | undefined;
  className?: string;
  larguraRotulo?: string;
}) {
  return (
    <div className={`flex gap-3 ${className ?? ""}`}>
      <span className={`shrink-0 font-semibold text-[var(--cor-primaria)] ${larguraRotulo ?? ""}`}>
        {rotulo}:
      </span>
      <span className="min-w-0 flex-1 break-words">{valor || " "}</span>
    </div>
  );
}

// Cabeçalho de seção: selo azul arredondado + título em caixa alta.
function Secao({ titulo, icone }: { titulo: string; icone: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--cor-primaria)] text-white">
        {icone}
      </span>
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-[var(--cor-primaria)]">
        {titulo}
      </h2>
    </div>
  );
}

// Linha rótulo/valor do cartão de cliente. Vazio vira espaço para preencher à
// mão — a folha continua utilizável enquanto o cadastro não estiver completo,
// que é a situação dos 13 mil clientes herdados da planilha.
function Campo({
  rotulo,
  valor,
  ultimo,
}: {
  rotulo: string;
  valor: string | null | undefined;
  ultimo?: boolean;
}) {
  return (
    <div className={`flex gap-3 py-1.5 ${ultimo ? "" : "border-b border-[var(--cor-borda)]"}`}>
      <span className="w-32 shrink-0 font-semibold text-[var(--cor-primaria)]">{rotulo}:</span>
      <span className="min-w-0 flex-1 break-words">{valor || " "}</span>
    </div>
  );
}

// Caixinha do bloco de expedição (peso, volumes, CEP).
function Caixinha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="rounded-xl border border-[var(--cor-borda)] px-3 py-1.5">
      <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--cor-primaria)]">{rotulo}</p>
      <p className="mt-0.5 min-h-[1.1rem]">{valor || " "}</p>
    </div>
  );
}

// Marcador da opção de frete escolhida.
function Selecao({ marcada }: { marcada: boolean }) {
  return (
    <span
      className={`mx-auto flex h-3 w-3 items-center justify-center rounded-full border ${
        marcada ? "border-[var(--cor-primaria)]" : "border-black/30"
      }`}
    >
      {marcada && <span className="h-1.5 w-1.5 rounded-full bg-[var(--cor-primaria)]" />}
    </span>
  );
}

function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <tr className="border-b border-[var(--cor-borda)]">
      <td className="px-4 py-1.5 font-semibold text-[var(--cor-primaria)]">{rotulo}:</td>
      <td className="px-4 py-1.5 text-right">{valor}</td>
    </tr>
  );
}

function IconePessoa() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
      <circle cx="8" cy="5" r="2.6" />
      <path d="M2.6 14c0-2.8 2.4-4.6 5.4-4.6s5.4 1.8 5.4 4.6z" />
    </svg>
  );
}

function IconeDocumento() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M4.2 2h4.6L12 5.2v8.8H4.2z" strokeLinejoin="round" />
      <path d="M6.2 8.2h4M6.2 10.6h4" strokeLinecap="round" />
    </svg>
  );
}

function IconeCaminhao() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
      <rect x="1" y="4" width="7.5" height="6.5" rx="1" />
      <path d="M9 6h2.7L14.5 8.6v1.9H9z" />
      <circle cx="4.6" cy="12" r="1.6" />
      <circle cx="11.8" cy="12" r="1.6" />
    </svg>
  );
}

function IconeCifrao() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
      <path d="M7.3 1.6h1.4v1.5h-1.4zM7.3 12.9h1.4v1.5h-1.4z" />
      <path d="M8 3.1c2 0 3.3 1 3.3 2.4h-1.7c0-.6-.6-1-1.6-1s-1.6.4-1.6 1c0 1.8 5 .7 5 3.6 0 1.5-1.4 2.5-3.4 2.5s-3.5-1-3.5-2.6h1.7c0 .7.7 1.2 1.8 1.2s1.7-.4 1.7-1c0-1.9-5-.8-5-3.6C4.7 4.1 6 3.1 8 3.1z" />
    </svg>
  );
}

function cidadeUf(cidade: string | null | undefined, uf: string | null | undefined): string | null {
  const partes = [cidade?.trim(), uf?.trim()].filter(Boolean);
  return partes.length > 0 ? partes.join(" / ") : null;
}

function formatarDataHora(data: Date): string {
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Linha({ rotulo, valor, negrito }: { rotulo: string; valor?: string; negrito?: boolean }) {
  return (
    <tr className={negrito ? "font-bold" : ""}>
      <td className="py-1">{rotulo}</td>
      <td className="py-1 text-right">{reais(valor)}</td>
    </tr>
  );
}
