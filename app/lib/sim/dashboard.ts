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
  clienteId: string;
  cliente: string;
  vendedorId: string;
  vendedor: string;
  sinal?: 1 | -1;
};

export type ItemDash = {
  id: string;
  tipo: "produto" | "kit";
  nome: string; // nome do produto ou "[Kit] ..."
  receita: string; // preço × quantidade
  quantidade: string;
  sinal?: 1 | -1;
};

export type RankingLinha = { id: string; nome: string; receita: Decimal; quantidade?: Decimal; margem?: Decimal };

export type Dashboard = {
  cards: {
    pedidosFechados: number;
    cancelamentos: number;
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
  const receitaBruta = pedidos.reduce((s, p) => s.plus(dec(p.gross_revenue_snapshot).times(p.sinal ?? 1)), ZERO);
  const receitaLiquida = pedidos.reduce((s, p) => s.plus(dec(p.net_revenue_snapshot).times(p.sinal ?? 1)), ZERO);
  const margem = pedidos.reduce((s, p) => s.plus(dec(p.contribution_margin_snapshot).times(p.sinal ?? 1)), ZERO);

  // Pedidos em faixa Crítica ou Negativa: classifica cada pedido pela SUA margem %.
  const criticos = pedidos.filter((p) => {
    if (p.sinal === -1) return false;
    const rl = dec(p.net_revenue_snapshot);
    if (rl.isZero()) return true; // sem receita líquida = problema
    const st = statusMargem(dec(p.contribution_margin_snapshot).div(rl), regras);
    return st !== null && /crítica|negativa/i.test(st.label);
  }).length;

  const rankearPedidos = (identidade: (p: PedidoDash) => { id: string; nome: string }): RankingLinha[] => {
    const grupos = new Map<string, { nome: string; receita: Decimal; margem: Decimal }>();
    for (const p of pedidos) {
      const k = identidade(p);
      const g = grupos.get(k.id) ?? { nome: k.nome, receita: ZERO, margem: ZERO };
      grupos.set(k.id, {
        nome: g.nome,
        receita: g.receita.plus(dec(p.gross_revenue_snapshot).times(p.sinal ?? 1)),
        margem: g.margem.plus(dec(p.contribution_margin_snapshot).times(p.sinal ?? 1)),
      });
    }
    return [...grupos.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.receita.comparedTo(a.receita))
      .slice(0, topo);
  };

  const gruposItens = new Map<string, { nome: string; receita: Decimal; quantidade: Decimal }>();
  for (const i of itens) {
    const chave = `${i.tipo}:${i.id}`;
    const g = gruposItens.get(chave) ?? { nome: i.nome, receita: ZERO, quantidade: ZERO };
    gruposItens.set(chave, {
      nome: g.nome,
      receita: g.receita.plus(dec(i.receita).times(i.sinal ?? 1)),
      quantidade: g.quantidade.plus(dec(i.quantidade).times(i.sinal ?? 1)),
    });
  }
  const rankingItens = [...gruposItens.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.receita.comparedTo(a.receita))
    .slice(0, topo);

  return {
    cards: {
      pedidosFechados: pedidos.filter((p) => (p.sinal ?? 1) === 1).length,
      cancelamentos: pedidos.filter((p) => p.sinal === -1).length,
      receitaBruta,
      margemContribuicao: margem,
      margemMediaPct: receitaLiquida.isZero() ? null : margem.div(receitaLiquida),
      pedidosCriticosOuNegativos: criticos,
    },
    rankings: {
      clientes: rankearPedidos((p) => ({ id: p.clienteId, nome: p.cliente })),
      vendedores: rankearPedidos((p) => ({ id: p.vendedorId, nome: p.vendedor })),
      itens: rankingItens,
    },
  };
}
