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
  fretePorContaCliente: boolean;
  comissao: EntradaDecimal | null; // override; null = padrão do canal
  canal: CanalRegras;
  uf: TabelasUF;
};

export type Simulacao = {
  resultado: ResultadoPedido;
  freteUsado: Decimal;
  comissaoUsada: Decimal;
  difalAplicado: Decimal;
  avisos: string[];
};

export function simular(entrada: EntradaSimulacao): Simulacao {
  const avisos: string[] = [];

  // Comissão: padrão do canal, com override auditável (Decisão D6).
  const comissaoUsada = dec(entrada.comissao ?? entrada.canal.comissaoPadrao);

  // DIFAL: canal decide se aplica; a UF fornece a alíquota.
  const difalAplicado = entrada.canal.aplicaDifal ? dec(entrada.uf.difalFinal) : new Decimal(0);
  if (entrada.canal.aplicaDifal && difalAplicado.isZero()) {
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

  const resultado = calcularPedido({
    itens: entrada.itens,
    frete: freteUsado,
    fretePorContaCliente: entrada.fretePorContaCliente,
    aliquotaImposto: entrada.uf.aliquotaIcsm,
    aliquotaDifal: difalAplicado,
    aliquotaComissao: comissaoUsada,
  });

  return { resultado, freteUsado, comissaoUsada, difalAplicado, avisos };
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
