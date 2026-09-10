import { describe, expect, it, vi } from "vitest";

describe("ficha técnica no formulário de produto", () => {
  it("aceita números vindos do banco nos campos de quantidade", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-key");

    const { quantidadeDoComponente } = await import("@app/lib/db/produtos");

    expect(
      quantidadeDoComponente({
        tipo: "insumo",
        refId: "linha",
        quantity_type: "lot",
        quantity: "",
        width: "",
        length: "",
        yield_rate: "",
        lot_size: 450 as unknown as string,
      }).valor.toString()
    ).toBe("0.002222222222222222222222222222222222222222");

    expect(
      quantidadeDoComponente({
        tipo: "insumo",
        refId: "punho",
        quantity_type: "direct",
        quantity: 2 as unknown as string,
        width: "",
        length: "",
        yield_rate: "",
        lot_size: "",
      }).valor.toString()
    ).toBe("2");
  });

  it("normaliza número brasileiro antes de salvar a ficha técnica", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-key");

    const { quantidadeDoComponente } = await import("@app/lib/db/produtos");

    expect(
      quantidadeDoComponente({
        tipo: "insumo",
        refId: "bobina",
        quantity_type: "area",
        quantity: "",
        width: "1,6",
        length: "2,8",
        yield_rate: "16",
        lot_size: "",
      }).valor.toString()
    ).toBe("0.28");

    expect(
      quantidadeDoComponente({
        tipo: "insumo",
        refId: "tecido",
        quantity_type: "direct",
        quantity: "1.000,5",
        width: "",
        length: "",
        yield_rate: "",
        lot_size: "",
      }).valor.toString()
    ).toBe("1000.5");
  });
});
