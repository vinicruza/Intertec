import { describe, expect, it } from "vitest";
import { toMoney } from "@calc";
import { montarDashboard, type ItemDash, type PedidoDash } from "../../app/lib/sim/dashboard";
import type { RegraMargem } from "../../app/lib/sim/params";

const REGRAS: RegraMargem[] = [
  { label: "Boa", min_rate: "0.40", max_rate: null, color: "green", sort_order: 1 },
  { label: "Atenção", min_rate: "0.25", max_rate: "0.40", color: "yellow", sort_order: 2 },
  { label: "Crítica", min_rate: "0.10", max_rate: "0.25", color: "orange", sort_order: 3 },
  { label: "Negativa", min_rate: null, max_rate: "0.10", color: "red", sort_order: 4 },
];

// Três pedidos conferíveis à mão:
//   P1: RL 10.219,50 | MC 4.069,08 (39,82% → Atenção)  cliente Unimed, vend. Patricia
//   P2: RL 8.000     | MC 1.200    (15% → Crítica)      cliente Hospital X, vend. Camila
//   P3: RL 5.000     | MC 250      (5% → Negativa)      cliente Unimed, vend. Patricia
const PEDIDOS: PedidoDash[] = [
  { gross_revenue_snapshot: "16800", net_revenue_snapshot: "10219.50", contribution_margin_snapshot: "4069.08", clienteId: "c1", cliente: "Unimed", vendedorId: "v1", vendedor: "Patricia" },
  { gross_revenue_snapshot: "10000", net_revenue_snapshot: "8000", contribution_margin_snapshot: "1200", clienteId: "c2", cliente: "Hospital X", vendedorId: "v2", vendedor: "Camila" },
  { gross_revenue_snapshot: "6000", net_revenue_snapshot: "5000", contribution_margin_snapshot: "250", clienteId: "c1", cliente: "Unimed", vendedorId: "v1", vendedor: "Patricia" },
];

const ITENS: ItemDash[] = [
  { id: "p1", tipo: "produto", nome: "Avental", receita: "16800", quantidade: "4000" },
  { id: "k1", tipo: "kit", nome: "[Kit] Cirurgia Básica", receita: "10000", quantidade: "50" },
  { id: "p1", tipo: "produto", nome: "Avental", receita: "6000", quantidade: "1500" },
];

describe("dashboard — cards e rankings", () => {
  const d = montarDashboard(PEDIDOS, ITENS, REGRAS);

  it("cards batem com a conta manual", () => {
    expect(d.cards.pedidosFechados).toBe(3);
    expect(toMoney(d.cards.receitaBruta)).toBe("32800.00");        // 16.800+10.000+6.000
    expect(toMoney(d.cards.margemContribuicao)).toBe("5519.08");   // 4.069,08+1.200+250
    // MC média = 5.519,08 ÷ 23.219,50 = 23,77%
    expect(d.cards.margemMediaPct!.times(100).toFixed(2)).toBe("23.77");
    expect(d.cards.pedidosCriticosOuNegativos).toBe(2);            // P2 (15%) e P3 (5%)
  });

  it("ranking de clientes soma pedidos do mesmo cliente", () => {
    expect(d.rankings.clientes[0].nome).toBe("Unimed");            // 22.800 > 10.000
    expect(toMoney(d.rankings.clientes[0].receita)).toBe("22800.00");
    expect(toMoney(d.rankings.clientes[0].margem!)).toBe("4319.08");
  });

  it("ranking de itens consolida por nome (produtos e kits)", () => {
    expect(d.rankings.itens[0].nome).toBe("Avental");              // 22.800
    expect(d.rankings.itens[0].quantidade!.toString()).toBe("5500");
    expect(d.rankings.itens[1].nome).toBe("[Kit] Cirurgia Básica");
  });

  it("ranking de vendedores", () => {
    expect(d.rankings.vendedores.map((v) => v.nome)).toEqual(["Patricia", "Camila"]);
  });

  it("não mistura entidades diferentes que têm o mesmo nome", () => {
    const pedidos = [
      { ...PEDIDOS[0], clienteId: "c1", cliente: "Mesmo nome" },
      { ...PEDIDOS[1], clienteId: "c2", cliente: "Mesmo nome" },
    ];
    const resultado = montarDashboard(pedidos, [], REGRAS);
    expect(resultado.rankings.clientes).toHaveLength(2);
    expect(resultado.rankings.clientes.map((x) => x.id).sort()).toEqual(["c1", "c2"]);
  });
});
