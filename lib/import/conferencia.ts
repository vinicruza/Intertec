import { Decimal } from "../calculations/decimal";
import { calcularPedido, type ItemPedido, type ResultadoPedido } from "../calculations/order";
import { ErroCalculoBloqueante } from "../calculations/types";
import { aliquotaDifal, aliquotaIcsm, percentualPortal } from "./pedidos";
import type { PedidoImportado, TabelasFiscais } from "./types";

// ============================================================
// Conferência da Camada 4 — motor do sistema × abas de vendedor
// ------------------------------------------------------------
// Roda `calcularPedido` com os MESMOS insumos que a planilha usou (receita,
// CMV, frete, UF) e compara linha a linha. Onde diverge, ou a planilha tem um
// bug conhecido (Calculations.md §9) ou o sistema tem uma regra decidida
// depois (§6, §10) — e o relatório precisa dizer qual dos dois, porque só um
// deles é motivo para mexer no código.
//
// Nada aqui altera o motor: é leitura e comparação.
// ============================================================

export const TOLERANCIA_DINHEIRO = new Decimal("0.01");
export const TOLERANCIA_PERCENTUAL = new Decimal("0.0001"); // 0,01 ponto percentual

// Parâmetros de canal como o SISTEMA os aplica (Calculations.md §8 e Decisão D4).
export type CanalPedido = {
  aplicaDifal: boolean;
  aliquotaComissao: Decimal;
  freteViaPortal: boolean; // canal marketplace: frete = %(UF) × receita
};

const COMISSAO_PADRAO = new Decimal("0.025");
const COMISSAO_EXTERNOS = new Decimal("0.061");

// A tabela do §8, traduzida para o modelo unificado de canais da Decisão D4.
// Revendas, Descpro e Edmilson não aplicam DIFAL; Descpro deixa a alíquota
// própria e passa a usar a tabela ICSM (D4) — a diferença aparece no relatório.
export const CANAIS: Record<string, CanalPedido> = {
  Patricia: { aplicaDifal: true, aliquotaComissao: COMISSAO_PADRAO, freteViaPortal: false },
  Camila: { aplicaDifal: true, aliquotaComissao: COMISSAO_PADRAO, freteViaPortal: false },
  Isabela: { aplicaDifal: true, aliquotaComissao: COMISSAO_PADRAO, freteViaPortal: false },
  Priscilene: { aplicaDifal: true, aliquotaComissao: COMISSAO_PADRAO, freteViaPortal: false },
  Suellen: { aplicaDifal: true, aliquotaComissao: COMISSAO_PADRAO, freteViaPortal: false },
  Nathalia: { aplicaDifal: true, aliquotaComissao: COMISSAO_PADRAO, freteViaPortal: false },
  Mari: { aplicaDifal: true, aliquotaComissao: COMISSAO_PADRAO, freteViaPortal: true },
  "Temporaria Patricia": {
    aplicaDifal: true,
    aliquotaComissao: COMISSAO_PADRAO,
    freteViaPortal: true,
  },
  Externos: { aplicaDifal: true, aliquotaComissao: COMISSAO_EXTERNOS, freteViaPortal: false },
  Revendas: { aplicaDifal: false, aliquotaComissao: COMISSAO_PADRAO, freteViaPortal: false },
  Descpro: { aplicaDifal: false, aliquotaComissao: COMISSAO_PADRAO, freteViaPortal: false },
  Edmilson: { aplicaDifal: false, aliquotaComissao: COMISSAO_PADRAO, freteViaPortal: false },
};

export type LinhaConferencia = {
  campo: string;
  sistema: Decimal | null;
  planilha: Decimal | null;
  diferenca: Decimal | null;
  bate: boolean;
  percentual: boolean; // muda a tolerância e a formatação no relatório
};

export type ConferenciaPedido = {
  aba: string;
  cliente: string | null;
  uf: string | null;
  ufNormalizada: string | null;
  itens: number;
  // Quando o motor recusa o pedido (T9 — CMV zerado), não há resultado a
  // comparar: o bloqueio É o resultado, e a planilha ter seguido em frente com
  // custo zero é o achado.
  bloqueio: string | null;
  resultado: ResultadoPedido | null;
  linhas: LinhaConferencia[];
  divergencias: LinhaConferencia[];
};

function comparar(
  campo: string,
  sistema: Decimal | null,
  planilha: Decimal | null,
  percentual = false
): LinhaConferencia {
  const tolerancia = percentual ? TOLERANCIA_PERCENTUAL : TOLERANCIA_DINHEIRO;
  if (sistema === null || planilha === null) {
    // Linha ausente na planilha (ex.: Revendas sem "Imposto") não é empate nem
    // divergência de valor: é diferença de estrutura, sinalizada como tal.
    return { campo, sistema, planilha, diferenca: null, bate: false, percentual };
  }
  const diferenca = sistema.minus(planilha);
  return {
    campo,
    sistema,
    planilha,
    diferenca,
    bate: diferenca.abs().lte(tolerancia),
    percentual,
  };
}

// Monta os itens do motor a partir das linhas da aba. Preço vazio vira 0: na
// planilha essas linhas existem para reservar o CMV do item (a "compressa que
// vai junto"), e a receita zero é intencional.
function itensDoMotor(pedido: PedidoImportado): ItemPedido[] {
  return pedido.itens.map((i) => ({
    nome: i.nome,
    precoVenda: i.precoVenda ?? new Decimal(0),
    quantidade: i.quantidade ?? new Decimal(0),
    cmvUnitario: i.cmvUnitario ?? new Decimal(0),
    despesaUnitaria: i.despesaUnitaria ?? new Decimal(0),
  }));
}

export function conferirPedido(
  pedido: PedidoImportado,
  tabelas: TabelasFiscais,
  canal: CanalPedido
): ConferenciaPedido {
  const ufNormalizada = pedido.uf ? pedido.uf.trim().toUpperCase() : null;
  const base = {
    aba: pedido.aba,
    cliente: pedido.cliente,
    uf: pedido.uf,
    ufNormalizada,
    itens: pedido.itens.length,
  };

  const icsm = aliquotaIcsm(tabelas, ufNormalizada);
  if (icsm === null) {
    return {
      ...base,
      bloqueio: `UF "${pedido.uf ?? "(vazia)"}" não encontrada na tabela ICSM.`,
      resultado: null,
      linhas: [],
      divergencias: [],
    };
  }

  // Canal marketplace calcula o próprio frete; nos demais o frete é digitado.
  const receitaPlanilha = pedido.receitaPlanilha ?? new Decimal(0);
  const percPortal = canal.freteViaPortal ? percentualPortal(tabelas, ufNormalizada) : null;
  const frete = canal.freteViaPortal
    ? (percPortal ?? new Decimal(0)).times(receitaPlanilha)
    : (pedido.deducoes.frete ?? new Decimal(0));

  let resultado: ResultadoPedido;
  try {
    resultado = calcularPedido({
      itens: itensDoMotor(pedido),
      frete,
      fretePorContaCliente: pedido.deducoes.freteCliente,
      // Faltava esta linha. A flag "Frete Cliente" faz duas coisas: zera a
      // DEDUÇÃO do frete e mantém o frete informado como base do IMPOSTO sobre
      // frete (mudança de 12/08/2026, que a tela já passa em `simular()`). Sem
      // ela o conferidor zerava o imposto sobre frete em toda aba com a caixa
      // marcada e acusava uma divergência que a aplicação não tem — seis das
      // doze abas saíam erradas no relatório do cliente.
      // SEMPRE true: este conferidor reproduz a PLANILHA, e lá a linha
      // `N7 = alíquota × N6` cobra o imposto sobre o frete com ou sem o "X".
      // O sistema segue a regra do Bryan e não cobra no caso não destacado
      // (ver `params.ts`) — é uma divergência conhecida, de `alíquota × frete`,
      // e quem a aponta é o relatório de conferência, não este cálculo.
      tributarFreteInformado: true,
      aliquotaImposto: icsm,
      aliquotaDifal: canal.aplicaDifal ? aliquotaDifal(tabelas, ufNormalizada) : new Decimal(0),
      aliquotaComissao: canal.aliquotaComissao,
    });
  } catch (e) {
    if (e instanceof ErroCalculoBloqueante) {
      return { ...base, bloqueio: e.message, resultado: null, linhas: [], divergencias: [] };
    }
    throw e;
  }

  const d = pedido.deducoes;
  const linhas: LinhaConferencia[] = [
    comparar("Receita bruta", resultado.receitaBruta, pedido.receitaPlanilha),
    comparar("CMV do pedido", resultado.cmvTotal, pedido.cmvPlanilha),
    comparar("Despesa do pedido", resultado.despesaTotal, pedido.despesaPlanilha),
    // Compara o frete INFORMADO, não o efetivo: quando o cliente paga, o
    // sistema zera a dedução mas a planilha mantém o valor na linha e o cancela
    // numa linha de ajuste abaixo. Comparar o efetivo contra o digitado
    // acusaria uma divergência que não existe.
    comparar("Frete informado", resultado.freteInformado, d.frete),
    comparar("Imposto sobre frete", resultado.impostoFrete, d.impostoFrete),
    comparar("Imposto sobre venda", resultado.imposto, d.imposto),
    comparar("DIFAL", resultado.difal, d.difal),
    comparar("Comissão", resultado.comissao, d.comissao),
    comparar("Receita líquida", resultado.receitaLiquida, d.receitaLiquida),
    comparar("Margem de contribuição %", resultado.margemContribuicaoPct, d.margemContribuicao, true),
  ];

  return {
    ...base,
    bloqueio: null,
    resultado,
    linhas,
    divergencias: linhas.filter((l) => !l.bate),
  };
}

export function conferirPedidos(
  pedidos: PedidoImportado[],
  tabelas: TabelasFiscais
): ConferenciaPedido[] {
  return pedidos.map((p) =>
    conferirPedido(
      p,
      tabelas,
      CANAIS[p.aba] ?? {
        aplicaDifal: true,
        aliquotaComissao: COMISSAO_PADRAO,
        freteViaPortal: false,
      }
    )
  );
}

// ------------------------------------------------------------
// Conferência das tabelas de parâmetro (Calculations.md §7)
// ------------------------------------------------------------

export type AchadoTabela = {
  tabela: string;
  uf: string;
  descricao: string;
  esperado: Decimal | null;
  encontrado: Decimal | null;
};

const UFS_BRASIL = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS",
  "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC",
  "SE", "SP", "TO",
];

// ICSM: a coluna "Soma" tem de ser PIS/COFINS + alíquota de ICMS.
// DIFAL: a coluna final deveria ser Pobreza (FCP) + Alíquota — e em 4 UFs não é
// (Calculations.md §9.5). A Decisão D5 manda migrar o valor final como está,
// então isto é um relatório de confirmação para o contador, não um erro a corrigir.
export function conferirTabelasFiscais(tabelas: TabelasFiscais): AchadoTabela[] {
  const achados: AchadoTabela[] = [];

  for (const linha of tabelas.icsm) {
    const [pis, aliquota, soma] = linha.valores;
    if (pis === null || aliquota === null || soma === null) {
      achados.push({
        tabela: "ICSM",
        uf: linha.uf,
        descricao: "linha incompleta",
        esperado: null,
        encontrado: soma,
      });
      continue;
    }
    const esperado = pis.plus(aliquota);
    if (!esperado.minus(soma).abs().lte(TOLERANCIA_PERCENTUAL)) {
      achados.push({
        tabela: "ICSM",
        uf: linha.uf,
        descricao: "soma ≠ PIS/COFINS + alíquota",
        esperado,
        encontrado: soma,
      });
    }
  }

  for (const linha of tabelas.difal) {
    const [pobreza, aliquota, difal] = linha.valores;
    if (pobreza === null || aliquota === null || difal === null) continue;
    const esperado = pobreza.plus(aliquota);
    if (!esperado.minus(difal).abs().lte(TOLERANCIA_PERCENTUAL)) {
      achados.push({
        tabela: "DIFAL",
        uf: linha.uf,
        descricao: "DIFAL final ≠ Pobreza + Alíquota (D5: migrar como está)",
        esperado,
        encontrado: difal,
      });
    }
  }

  // Cobertura: uma UF ausente vira alíquota zero silenciosa no SUMIF.
  for (const uf of UFS_BRASIL) {
    if (!tabelas.icsm.some((l) => l.uf === uf)) {
      achados.push({
        tabela: "ICSM",
        uf,
        descricao: "UF ausente da tabela (imposto zero silencioso)",
        esperado: null,
        encontrado: null,
      });
    }
    if (!tabelas.portal.some((l) => l.uf === uf)) {
      achados.push({
        tabela: "Portal",
        uf,
        descricao: "UF ausente da tabela de frete do marketplace",
        esperado: null,
        encontrado: null,
      });
    }
  }

  return achados;
}
