import { describe, expect, it, vi } from "vitest";

// Regressão: o PostgREST entrega `numeric` como NÚMERO, não como texto. O
// formulário de insumo é de texto, e a conversão chamava `.trim()` — que estoura
// em número. O efeito era duplo e silencioso: a prévia de preço ficava em "—" e
// a edição não gravava, porque o zod reprovava campos que não exibem mensagem.
//
// É o mesmo defeito já coberto para a ficha de produto em
// tests/produtos/quantidade-form.test.ts, que na época não foi aplicado aqui.
describe("formulário de insumo", () => {
  it("aceita números vindos do banco no preço, fator e alíquotas", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-key");

    const { derivarPrecos } = await import("@app/lib/db/insumos");

    // Fixture do Calculations.md §2 — Bobina SMS 40gr: 21,80/kg × 0,04 kg/m².
    const doBanco = derivarPrecos({
      name: "Bobina SMS 40 gr m²",
      category: "",
      purchase_unit: "kg",
      purchase_price: 21.8 as unknown as string,
      conversion_factor: 0.04 as unknown as string,
      consumption_unit: "m²",
      icms_rate: 0.12 as unknown as string,
      pis_cofins_rate: 0.0925 as unknown as string,
      is_labor: false,
      is_packaging: false,
    });

    expect(doBanco.comImposto.toString()).toBe("0.872");
    expect(doBanco.semImposto.toString()).toBe("0.6867");
  });

  it("continua aceitando o texto digitado, com vírgula", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-key");

    const { derivarPrecos } = await import("@app/lib/db/insumos");

    const digitado = derivarPrecos({
      name: "Bobina SMS 40 gr m²",
      category: "",
      purchase_unit: "kg",
      purchase_price: "21,80",
      conversion_factor: "0,04",
      consumption_unit: "m²",
      icms_rate: "0,12",
      pis_cofins_rate: "0,0925",
      is_labor: false,
      is_packaging: false,
    });

    expect(digitado.comImposto.toString()).toBe("0.872");
    expect(digitado.semImposto.toString()).toBe("0.6867");
  });
});
