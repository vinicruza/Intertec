import {
  Decimal,
  calcularPedido,
  dec,
  type EntradaDecimal,
  type ItemPedido,
  type ResultadoPedido,
} from "@calc";

// Montagem dos parâmetros do pedido a partir das regras do canal (Decisão D4)
// e das tabelas por UF. Módulo puro (sem banco/tela) para ser testável —
// inclusive o fixture Patricia (critério de aceite da Sprint 10).

export type CanalRegras = {
  aplicaDifal: boolean;
  comissaoPadrao: string; // fração
  modeloFrete: "manual" | "uf_percent";
};

export type TabelasUF = {
  aliquotaIcsm: EntradaDecimal; // ICMS + PIS/COFINS da UF de destino
  difalFinal: EntradaDecimal; // alíquota final da UF (0 para SP)
  fretePortalPct: EntradaDecimal | null; // % da receita (canais marketplace)
};

export type EntradaSimulacao = {
  itens: ItemPedido[];
  freteManual: EntradaDecimal; // usado quando o canal é frete manual
  fretePorContaCliente: boolean; // legado no banco; na tela, significa "Frete Destacado"
  freteJaDestacadoNosPrecos?: boolean;
  comissao: EntradaDecimal | null; // override; null = padrão do canal
  // Override por pedido; null = padrão do canal (Decisão D4 estendida,
  // 05/08/2026 — ver Calculations.md §12). DIFAL é devido pela Intertech
  // quando o cliente é NÃO CONTRIBUINTE; contribuinte não gera DIFAL. Isso
  // varia pedido a pedido dentro do mesmo canal/vendedor, então precisa de
  // override aqui — igual à comissão (D6), não só configuração fixa de canal.
  aplicaDifal?: boolean | null;
  canal: CanalRegras;
  uf: TabelasUF;
};

export type Simulacao = {
  resultado: ResultadoPedido;
  freteUsado: Decimal;
  comissaoUsada: Decimal;
  difalAplicado: Decimal;
  aplicaDifalUsado: boolean;
  itensCalculados: ItemPedido[];
  avisos: string[];
};

export function simular(entrada: EntradaSimulacao): Simulacao {
  const avisos: string[] = [];

  // Comissão: padrão do canal, com override auditável (Decisão D6).
  const comissaoUsada = dec(entrada.comissao ?? entrada.canal.comissaoPadrao);

  // DIFAL: padrão do canal, com override por pedido (05/08/2026). A UF
  // fornece a alíquota (já com FCP embutido, Calculations.md §7.2).
  const aplicaDifalUsado = entrada.aplicaDifal ?? entrada.canal.aplicaDifal;
  const difalAplicado = aplicaDifalUsado ? dec(entrada.uf.difalFinal) : new Decimal(0);
  if (aplicaDifalUsado && difalAplicado.isZero()) {
    avisos.push("DIFAL aplicável e zerado para esta UF — confira a tabela (PRD §7).");
  }

  // Frete: manual ou % da receita por UF (canal marketplace).
  let freteUsado = dec(entrada.freteManual);
  if (entrada.canal.modeloFrete === "uf_percent") {
    const receita = entrada.itens.reduce(
      (s, i) => s.plus(dec(i.precoVenda).times(dec(i.quantidade))),
      new Decimal(0)
    );
    freteUsado = dec(entrada.uf.fretePortalPct ?? "0").times(receita);
    if (entrada.uf.fretePortalPct === null) {
      avisos.push("UF sem percentual de frete na tabela Portal — frete considerado 0.");
    }
  }

  // Frete destacado segue a planilha oficial: o frete entra na cascata como
  // linha própria, com imposto sobre frete, mas NÃO infla a receita dos itens
  // nem a base de comissão/impostos da venda. O "final com frete" é só leitura
  // comercial para o vendedor, não a base da rentabilidade.
  //
  // A caixa "Frete destacado" da tela é a coluna "Frete Cliente" da planilha:
  //
  //   MARCADA   (destacado na nota, o cliente paga)  → o frete NÃO sai do
  //             resultado. Na planilha é o "X", que faz `N12 = -N6` anular a
  //             linha do frete.
  //   EM BRANCO (a Intertec paga o transporte)       → o frete SAI do
  //             resultado, como qualquer outro custo. Na planilha é `N12 = 0`,
  //             e o `N14 = F24 - SOMA(N6:N12)` desconta o frete inteiro.
  //
  // O IMPOSTO sobre o frete segue a regra ditada pelo Bryan em áudio
  // (19/08/2026), que é o posicionamento da empresa:
  //
  //   "Se o frete estiver destacado na nota, o imposto deve ser calculado sobre
  //    o valor do pedido MAIS o frete. Se o frete não estiver destacado, ou
  //    seja, se ele não aparecer na nota fiscal, o imposto deve ser calculado
  //    SOMENTE sobre o valor do pedido."
  //
  // Ou seja: a mesma caixa manda nas duas coisas. Marcada → não deduz e
  // tributa; em branco → deduz e não tributa.
  //
  // A planilha ainda cobra o imposto sobre o frete nos dois casos (a linha
  // `N7 = alíquota × N6` não olha o "X"), e o próprio Bryan disse no áudio que
  // "na planilha eu não consegui configurar qual é a forma correta". Onde há
  // posicionamento claro da empresa, ele vale; a planilha vale no resto.
  // Enquanto a planilha não for ajustada, ela cobra `alíquota × frete` a mais
  // em pedido não destacado. Correção lá: `N7 = SE(N11="X"; alíquota × N6; 0)`.
  //
  // Até 21/08/2026 esta linha mandava `fretePorContaCliente: true` fixo, e por
  // isso o frete NUNCA saía do resultado — a margem do simulador ficava melhor
  // que a da planilha em todo pedido em que a Intertec paga o transporte.
  const freteDestacado = entrada.fretePorContaCliente;
  const itensCalculados = entrada.itens;

  const resultado = calcularPedido({
    itens: itensCalculados,
    frete: freteUsado,
    fretePorContaCliente: freteDestacado,
    tributarFreteInformado: freteDestacado,
    aliquotaImposto: entrada.uf.aliquotaIcsm,
    aliquotaDifal: difalAplicado,
    aliquotaComissao: comissaoUsada,
  });

  return { resultado, freteUsado, comissaoUsada, difalAplicado, aplicaDifalUsado, itensCalculados, avisos };
}

export function aplicarFreteDestacadoAosItens(itens: ItemPedido[], frete: Decimal): ItemPedido[] {
  if (frete.lte(0) || itens.length === 0) return itens;

  const receitas = itens.map((i) => dec(i.precoVenda).times(dec(i.quantidade)));
  const receitaBase = receitas.reduce((s, r) => s.plus(r), new Decimal(0));
  if (receitaBase.lte(0)) return itens;

  return itens.map((item, i) => {
    const quantidade = dec(item.quantidade);
    if (quantidade.lte(0)) return item;

    const freteDaLinha = frete.times(receitas[i].div(receitaBase));
    const acrescimoUnitario = freteDaLinha.div(quantidade);
    return {
      ...item,
      precoVenda: dec(item.precoVenda).plus(acrescimoUnitario).toString(),
    };
  });
}

// Faixas de status da margem de contribuição (PRD §5.5), vindas de margin_rules.
export type RegraMargem = {
  label: string;
  min_rate: string | null;
  max_rate: string | null;
  color: string | null;
  sort_order: number;
};

export type SeloMargemComercial = {
  label: "Vermelha" | "Amarela" | "Verde" | "Azul";
  color: "red" | "yellow" | "green" | "blue";
};

export function statusMargem(pct: Decimal, regras: RegraMargem[]): RegraMargem | null {
  const ordenadas = [...regras].sort((a, b) => a.sort_order - b.sort_order);
  for (const r of ordenadas) {
    const min = r.min_rate === null ? null : dec(r.min_rate);
    const max = r.max_rate === null ? null : dec(r.max_rate);
    const acimaDoMin = min === null || pct.gte(min);
    const abaixoDoMax = max === null || pct.lt(max);
    if (acimaDoMin && abaixoDoMax) return r;
  }
  return null;
}

// ---------- Faixas do selo comercial, por canal e por vendedor ----------
//
// Pedido da Intertech em 26/08/2026: Marketplace vende com estrutura de custo
// diferente do Interno e precisa de régua própria — até 29,99 vermelho, 30 a
// 39,99 amarelo, 40 verde, acima de 50 azul.
//
// Em vez de gravar o caso da Mari no código, a régua virou dado. A próxima vez
// que isso mudar não deve exigir programador.
export type FaixaMargemComercial = {
  channel_id: string | null;
  seller_id: string | null;
  red_max: string;
  yellow_max: string;
  green_max: string;
};

// O que valia antes de as faixas existirem. Continua sendo a rede de segurança
// para quando a tabela não responde: sem ela, uma falha de leitura mudaria a
// régua de aprovação de todo mundo em silêncio.
export const FAIXA_MARGEM_PADRAO = { red_max: "0.40", yellow_max: "0.50", green_max: "0.65" };

export type TetosDaFaixa = { red_max: string; yellow_max: string; green_max: string };

// Do mais específico para o mais geral: a faixa do VENDEDOR manda sobre a do
// canal, que manda sobre a da casa. É o que permite abrir exceção para uma
// pessoa sem mexer no canal inteiro.
export function faixaDoPedido(
  faixas: FaixaMargemComercial[],
  escopo: { channelId?: string | null; sellerId?: string | null }
): TetosDaFaixa {
  const doVendedor =
    escopo.sellerId != null ? faixas.find((f) => f.seller_id === escopo.sellerId) : undefined;
  if (doVendedor) return doVendedor;

  const doCanal =
    escopo.channelId != null
      ? faixas.find((f) => f.seller_id === null && f.channel_id === escopo.channelId)
      : undefined;
  if (doCanal) return doCanal;

  const daCasa = faixas.find((f) => f.seller_id === null && f.channel_id === null);
  return daCasa ?? FAIXA_MARGEM_PADRAO;
}

// Teto inclusivo, como sempre foi: `pct <= teto` cai na cor. É o que faz
// "até 29,99" ser vermelho e 30,00 já ser amarelo.
export function seloMargemComercial(
  pct: Decimal,
  faixa: TetosDaFaixa = FAIXA_MARGEM_PADRAO
): SeloMargemComercial {
  if (pct.lte(faixa.red_max)) return { label: "Vermelha", color: "red" };
  if (pct.lte(faixa.yellow_max)) return { label: "Amarela", color: "yellow" };
  if (pct.lte(faixa.green_max)) return { label: "Verde", color: "green" };
  return { label: "Azul", color: "blue" };
}

export function seloExigeAprovacao(selo: SeloMargemComercial): boolean {
  return selo.color === "red" || selo.color === "yellow";
}

// ---------- "Frete destacado" já vem marcado (Intertech, 31/08/2026) ----------
//
// Pedido da cliente, em áudio: "não dá para a gente fazer ao contrário,
// deixando ele sempre destacado? Quando não for, elas teriam que desmarcar.
// Teoricamente, todo pedido já entraria com o frete como destacado."
//
// Frete destacado é a regra na venda direta: o transporte vai na nota e o
// cliente paga. Não destacado é a exceção. A caixa nascia em branco e obrigava
// a marcar em quase todo pedido — e esquecer de marcar tirava da conta um
// frete que o cliente estava pagando.
//
// A EXCEÇÃO é o canal de frete automático (`uf_percent`, o Marketplace) — a
// própria cliente disse "esquece o marketplace". Lá o frete não é digitado: é
// uma ESTIMATIVA de % da receita por UF, que a Intertech paga e que por isso
// sai da margem, sem ir para a conta do cliente. Foi exatamente esse o erro
// relatado em 27/08/2026 no pedido 05270826 (Mari), quando R$ 280,80 de frete
// estimado apareceram somados ao TOTAL do cliente na folha. Marcá-lo por
// padrão traria o mesmo problema de volta.
//
// Isto é só o valor INICIAL da caixa: em qualquer canal quem monta o pedido
// marca e desmarca à vontade, e pedido já gravado sempre abre com o que foi
// gravado.
export function freteDestacadoPadrao(
  modeloFrete: CanalRegras["modeloFrete"] | null | undefined
): boolean {
  return modeloFrete !== "uf_percent";
}
