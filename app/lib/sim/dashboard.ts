import { Decimal, dec } from "@calc";
import { statusMargem, type RegraMargem } from "./params";

// ============================================================
// Dashboard (PRD §6.9): cards e rankings sobre pedidos FECHADOS.
// Toda a agregação vem dos snapshots (custos do momento da venda).
// ============================================================

export type PedidoDash = {
  net_revenue_snapshot: string;
  gross_revenue_snapshot: string;
  contribution_margin_snapshot: string;
  cliente: string;
  vendedor: string;
};

export type ItemDash = {
  nome: string; // nome do produto ou "[Kit] ..."
  receita: string; // preço × quantidade
  quantidade: string;
};

export type RankingLinha = { nome: string; receita: Decimal; quantidade?: Decimal; margem?: Decimal };

export type Dashboard = {
  cards: {
    pedidosFechados: number;
    receitaBruta: Decimal;
    margemContribuicao: Decimal;
    margemMediaPct: Decimal | null; // Σ MC ÷ Σ receita líquida (D2)
    pedidosCriticosOuNegativos: number;
  };
  rankings: {
    clientes: RankingLinha[];
    vendedores: RankingLinha[];
    itens: RankingLinha[]; // produtos e kits por receita
  };
};

const ZERO = new Decimal(0);

export function montarDashboard(
  pedidos: PedidoDash[],
  itens: ItemDash[],
  regras: RegraMargem[],
  topo = 5
): Dashboard {
  const receitaBruta = pedidos.reduce((s, p) => s.plus(dec(p.gross_revenue_snapshot)), ZERO);
  const receitaLiquida = pedidos.reduce((s, p) => s.plus(dec(p.net_revenue_snapshot)), ZERO);
  const margem = pedidos.reduce((s, p) => s.plus(dec(p.contribution_margin_snapshot)), ZERO);

  // Pedidos em faixa Crítica ou Negativa: classifica cada pedido pela SUA margem %.
  const criticos = pedidos.filter((p) => {
    const rl = dec(p.net_revenue_snapshot);
    if (rl.isZero()) return true; // sem receita líquida = problema
    const st = statusMargem(dec(p.contribution_margin_snapshot).div(rl), regras);
    return st !== null && /crítica|negativa/i.test(st.label);
  }).length;

  const rankearPedidos = (chave: (p: PedidoDash) => string): RankingLinha[] => {
    const grupos = new Map<string, { receita: Decimal; margem: Decimal }>();
    for (const p of pedidos) {
      const k = chave(p);
      const g = grupos.get(k) ?? { receita: ZERO, margem: ZERO };
      grupos.set(k, {
        receita: g.receita.plus(dec(p.gross_revenue_snapshot)),
        margem: g.margem.plus(dec(p.contribution_margin_snapshot)),
      });
    }
    return [...grupos.entries()]
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.receita.comparedTo(a.receita))
      .slice(0, topo);
  };

  const gruposItens = new Map<string, { receita: Decimal; quantidade: Decimal }>();
  for (const i of itens) {
    const g = gruposItens.get(i.nome) ?? { receita: ZERO, quantidade: ZERO };
    gruposItens.set(i.nome, {
      receita: g.receita.plus(dec(i.receita)),
      quantidade: g.quantidade.plus(dec(i.quantidade)),
    });
  }
  const rankingItens = [...gruposItens.entries()]
    .map(([nome, v]) => ({ nome, ...v }))
    .sort((a, b) => b.receita.comparedTo(a.receita))
    .slice(0, topo);

  return {
    cards: {
      pedidosFechados: pedidos.length,
      receitaBruta,
      margemContribuicao: margem,
      margemMediaPct: receitaLiquida.isZero() ? null : margem.div(receitaLiquida),
      pedidosCriticosOuNegativos: criticos,
    },
    rankings: {
      clientes: rankearPedidos((p) => p.cliente),
      vendedores: rankearPedidos((p) => p.vendedor),
      itens: rankingItens,
    },
  };
}
