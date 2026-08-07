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

  // Frete destacado: o frete continua existindo no pedido, mas entra também no
  // preço unitário dos itens, rateado pela participação de cada linha na
  // receita original. Quando a simulação vem de um pedido salvo, os preços já
  // estão destacados no banco e não podem receber o frete de novo.
  const itensCalculados =
    entrada.fretePorContaCliente && !entrada.freteJaDestacadoNosPrecos
      ? aplicarFreteDestacadoAosItens(entrada.itens, freteUsado)
      : entrada.itens;

  const resultado = calcularPedido({
    itens: itensCalculados,
    frete: freteUsado,
    fretePorContaCliente: false,
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
