import { describe, expect, it } from "vitest";
import {
  Decimal,
  ErroCalculoBloqueante,
  consumoOrdenado,
  explodirConsumo,
  type ProdutoComposicao,
} from "@calc";

// Explosão de consumo até o insumo (reunião Intertech 16/07/2026).
// O laminado não tem código próprio — está dentro de vários produtos. Só se
// responde "quanto vendemos de laminado" descendo a ficha técnica.

const produtos: ProdutoComposicao[] = [
  {
    // Avental: consome bobina por área (1 × 1,2 ÷ 0,99 = 1,212121…) e 2 punhos.
    id: "avental",
    componentes: [
      { tipo: "insumo", insumoId: "bobina", quantidade: { tipo: "area", largura: "1", comprimento: "1.2", rendimento: "0.99" } },
      { tipo: "insumo", insumoId: "punho", quantidade: { tipo: "direta", quantidade: "2" } },
    ],
  },
  {
    // Campo: consome a mesma bobina, e uma caixa rateada por 150 unidades.
    id: "campo",
    componentes: [
      { tipo: "insumo", insumoId: "bobina", quantidade: { tipo: "direta", quantidade: "0.5" } },
      { tipo: "insumo", insumoId: "caixa", quantidade: { tipo: "lote", tamanhoLote: "150" } },
    ],
  },
  {
    // Kit: 2 aventais + 1 campo.
    id: "kit",
    componentes: [
      { tipo: "produto", produtoId: "avental", quantidade: { tipo: "direta", quantidade: "2" } },
      { tipo: "produto", produtoId: "campo", quantidade: { tipo: "direta", quantidade: "1" } },
    ],
  },
];

function proximo(valor: Decimal | undefined, esperado: string) {
  expect(valor).toBeDefined();
  expect(valor!.minus(esperado).abs().lte("0.0001")).toBe(true);
}

describe("explosão de consumo por insumo", () => {
  it("soma o insumo que aparece em produtos diferentes", () => {
    // 10 aventais → 12,12121… de bobina; 4 campos → 2 de bobina.
    const c = explodirConsumo(
      [
        { produtoId: "avental", quantidade: "10" },
        { produtoId: "campo", quantidade: "4" },
      ],
      produtos
    );
    proximo(c.get("bobina"), "14.121212");
    proximo(c.get("punho"), "20");
    proximo(c.get("caixa"), "0.026667"); // 4 ÷ 150
  });

  it("desce até o insumo através do kit", () => {
    // 1 kit = 2 aventais + 1 campo → bobina 2×1,212121 + 0,5 = 2,924242…
    const c = explodirConsumo([{ produtoId: "kit", quantidade: "1" }], produtos);
    proximo(c.get("bobina"), "2.924242");
    proximo(c.get("punho"), "4");
  });

  it("multiplica corretamente pela quantidade vendida", () => {
    const um = explodirConsumo([{ produtoId: "kit", quantidade: "1" }], produtos);
    const cem = explodirConsumo([{ produtoId: "kit", quantidade: "100" }], produtos);
    proximo(cem.get("bobina"), um.get("bobina")!.times(100).toString());
  });

  it("acumula vendas do mesmo produto em linhas separadas", () => {
    const separado = explodirConsumo(
      [
        { produtoId: "avental", quantidade: "3" },
        { produtoId: "avental", quantidade: "7" },
      ],
      produtos
    );
    const junto = explodirConsumo([{ produtoId: "avental", quantidade: "10" }], produtos);
    proximo(separado.get("bobina"), junto.get("bobina")!.toString());
  });

  it("ignora quantidade zero ou negativa em vez de subtrair consumo", () => {
    const c = explodirConsumo(
      [
        { produtoId: "avental", quantidade: "5" },
        { produtoId: "avental", quantidade: "0" },
        { produtoId: "avental", quantidade: "-3" },
      ],
      produtos
    );
    proximo(c.get("punho"), "10");
  });

  it("produto sem ficha técnica é erro bloqueante, não consumo zero", () => {
    expect(() => explodirConsumo([{ produtoId: "fantasma", quantidade: "1" }], produtos))
      .toThrow(ErroCalculoBloqueante);
  });

  it("referência circular é barrada — geraria consumo infinito", () => {
    const circular: ProdutoComposicao[] = [
      { id: "A", componentes: [{ tipo: "produto", produtoId: "B", quantidade: { tipo: "direta", quantidade: "1" } }] },
      { id: "B", componentes: [{ tipo: "produto", produtoId: "A", quantidade: { tipo: "direta", quantidade: "1" } }] },
    ];
    expect(() => explodirConsumo([{ produtoId: "A", quantidade: "1" }], circular))
      .toThrow(ErroCalculoBloqueante);
  });

  it("ordena do maior consumo para o menor", () => {
    const c = explodirConsumo([{ produtoId: "avental", quantidade: "10" }], produtos);
    const lista = consumoOrdenado(c);
    expect(lista[0].insumoId).toBe("punho"); // 20 > 12,12
    expect(lista[1].insumoId).toBe("bobina");
  });
});
