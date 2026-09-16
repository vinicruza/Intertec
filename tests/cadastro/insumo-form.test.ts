import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { InsumoFormulario } from "@app/lib/db/insumos";

// Regressão: o PostgREST entrega `numeric` como NÚMERO, não como texto. O
// formulário de insumo é de texto, e a conversão chamava `.trim()` — que estoura
// em número. O efeito era duplo e silencioso: a prévia de preço ficava em "—" e
// a edição não gravava, porque o zod reprovava campos que não exibem mensagem.
//
// É o mesmo defeito já coberto para a ficha de produto em
// tests/produtos/quantidade-form.test.ts, que na época não foi aplicado aqui.
// Só o tipo: o `import type` some na compilação e não dispara a leitura de
// ambiente que obriga o resto do arquivo a importar o módulo depois do stub.
async function importarInsumos() {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-key");
  return import("@app/lib/db/insumos");
}

// Bobina SMS 40gr do Calculations.md §2, com o fator digitado (o jeito antigo).
function campos(troca: Partial<InsumoFormulario> = {}): InsumoFormulario {
  return {
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
    is_roll: false,
    grammage_gsm: "",
    ...troca,
  };
}

describe("formulário de insumo", () => {
  it("aceita números vindos do banco no preço, fator e alíquotas", async () => {
    const { derivarPrecos } = await importarInsumos();

    // Fixture do Calculations.md §2 — Bobina SMS 40gr: 21,80/kg × 0,04 kg/m².
    const doBanco = derivarPrecos(campos({
      purchase_price: 21.8 as unknown as string,
      conversion_factor: 0.04 as unknown as string,
      icms_rate: 0.12 as unknown as string,
      pis_cofins_rate: 0.0925 as unknown as string,
    }));

    expect(doBanco.comImposto.toString()).toBe("0.872");
    expect(doBanco.semImposto.toString()).toBe("0.6867");
  });

  it("continua aceitando o texto digitado, com vírgula", async () => {
    const { derivarPrecos } = await importarInsumos();

    const digitado = derivarPrecos(campos());

    expect(digitado.comImposto.toString()).toBe("0.872");
    expect(digitado.semImposto.toString()).toBe("0.6867");
  });

  // ------------------------------------------------------------------
  // Bobina por quilo (Calculations.md §2.1) — pedido do Bryan, 16/09/2026
  // ------------------------------------------------------------------
  //
  // Os dois exemplos são os que ele mandou. São a definição de "está certo":
  // se um deles mudar, o cadastro deixou de calcular o que a empresa combinou.
  it("bobina: preço do kg × gramatura 40 = 0,80 por m² (exemplo 1 do Bryan)", async () => {
    const { derivarPrecos } = await importarInsumos();

    const bobina = derivarPrecos(campos({
      purchase_price: "20,00",
      is_roll: true,
      grammage_gsm: "40",
      conversion_factor: "1", // o fator antigo do cadastro é ignorado na bobina
    }));

    expect(bobina.fator.toString()).toBe("0.04");
    expect(bobina.comImposto.toString()).toBe("0.8");
  });

  it("bobina: preço do kg × gramatura 30 = 0,6768 por m² (exemplo 2 do Bryan)", async () => {
    const { derivarPrecos } = await importarInsumos();

    const bobina = derivarPrecos(campos({
      purchase_price: "22,56",
      is_roll: true,
      grammage_gsm: "30",
      conversion_factor: "1",
    }));

    expect(bobina.fator.toString()).toBe("0.03");
    expect(bobina.comImposto.toString()).toBe("0.6768");
    // Daí para frente é o caminho de sempre: 0,6768 × (1 − 0,12 − 0,0925).
    expect(bobina.semImposto.toString()).toBe("0.53298");
  });

  it("bobina: o fator gravado no banco é o derivado da gramatura", async () => {
    const { fatorDoFormulario } = await importarInsumos();

    // É o que mantém o resto do sistema intocado — CMV, kits, cascata e DRE
    // continuam lendo preço de compra × fator de conversão.
    expect(fatorDoFormulario(campos({ is_roll: true, grammage_gsm: "30" })).toString()).toBe("0.03");
  });

  it("sem a marca de bobina, o fator digitado continua mandando", async () => {
    const { derivarPrecos } = await importarInsumos();

    // Regressão: os 84 insumos que não são bobina não podem mudar de custo por
    // causa desta mudança.
    const semBobina = derivarPrecos(campos({ grammage_gsm: "30" }));

    expect(semBobina.fator.toString()).toBe("0.04");
    expect(semBobina.comImposto.toString()).toBe("0.872");
    expect(semBobina.semImposto.toString()).toBe("0.6867");
  });

  it("preenche o preço de compra pelo preço vigente quando a coluna antiga está nula", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-key");

    const { precoCompraParaFormulario } = await import("@app/lib/db/insumos");

    expect(precoCompraParaFormulario({
      purchase_price: null,
      price_with_tax: "0.872",
      conversion_factor: "0.04",
    })).toBe("21.8");
  });
});

// ============================================================
// A metade da gravação que mora no banco
// ============================================================
//
// `save_input_and_recalculate` já engoliu um campo em silêncio uma vez: a
// migração 20260730000200 registra que a função NUNCA gravou `is_labor` — a
// tela mandava, a função não listava a coluna, e ninguém percebeu. O projeto
// não sobe Postgres no CI, então a conferência aqui é por leitura da migração,
// como em tests/pedidos/regras-do-banco.test.ts.
describe("save_input_and_recalculate grava a bobina", () => {
  const DIR = join(import.meta.dirname, "../../supabase/migrations");

  // A definição vigente é a última, na ordem das migrações.
  const vigente = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(DIR, f), "utf8"))
    .filter((sql) => /create or replace function public\.save_input_and_recalculate\s*\(/i.test(sql))
    .at(-1)!;

  it("lista is_roll e grammage_gsm — sem isso o preço do kg não chega ao banco", () => {
    expect(vigente).toMatch(/is_roll/);
    expect(vigente).toMatch(/grammage_gsm/);
  });

  it("não perdeu is_labor nem is_packaging no caminho", () => {
    expect(vigente).toMatch(/is_labor/);
    expect(vigente).toMatch(/is_packaging/);
  });

  it("o banco recusa bobina sem gramatura (custo zero em silêncio, PRD §7)", () => {
    const todas = readdirSync(DIR)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(DIR, f), "utf8"))
      .join("\n");
    expect(todas).toMatch(/check\s*\(not is_roll or \(grammage_gsm is not null and grammage_gsm > 0\)\)/i);
  });
});
