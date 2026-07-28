import { describe, expect, it } from "vitest";
import {
  descreverQuantidade,
  explicarQuantidade,
  validarComponente,
  validarFicha,
  type ComponenteForm,
  type QuantidadeArmazenada,
} from "../../app/lib/sim/ficha";

// Validação da ficha técnica antes do banco. Espelha as constraints da
// migration `catalog`: quantity > 0, width/length/yield_rate > 0, lot_size > 0.
// Rendimento e tamanho de lote viram DENOMINADOR — em branco, o motor
// calculava 1 ÷ 0 = Infinity e o usuário só via o erro cru do Postgres.

const base: ComponenteForm = {
  tipo: "insumo", refId: "insumo-1", quantity_type: "direct",
  quantity: "1", width: "", length: "", yield_rate: "0.99", lot_size: "",
};

const comp = (over: Partial<ComponenteForm>): ComponenteForm => ({ ...base, ...over });

describe("componente por lote", () => {
  const lote = (lot_size: string) => comp({ quantity_type: "lot", lot_size });

  it("aceita lote válido", () => {
    expect(validarComponente(lote("150"), 0)).toBeNull();
  });

  it("recusa lote zerado — seria divisão por zero", () => {
    expect(validarComponente(lote("0"), 0)).toBe("Componente 1: o tamanho do lote deve ser maior que zero.");
  });

  it("recusa lote em branco em vez de tratar como zero", () => {
    expect(validarComponente(lote(""), 0)).toBe("Componente 1: Informe o tamanho do lote.");
  });

  it("recusa lote negativo", () => {
    expect(validarComponente(lote("-5"), 0)).toContain("maior que zero");
  });
});

describe("componente por área", () => {
  const area = (over: Partial<ComponenteForm>) =>
    comp({ quantity_type: "area", width: "1", length: "1.2", yield_rate: "0.99", ...over });

  it("aceita área válida", () => {
    expect(validarComponente(area({}), 0)).toBeNull();
  });

  it("recusa rendimento zerado", () => {
    expect(validarComponente(area({ yield_rate: "0" }), 0)).toBe(
      "Componente 1: o rendimento deve ser maior que zero."
    );
  });

  it("rendimento em branco continua valendo 1 (sem perda)", () => {
    expect(validarComponente(area({ yield_rate: "" }), 0)).toBeNull();
  });

  it("recusa largura em branco", () => {
    expect(validarComponente(area({ width: "" }), 0)).toBe("Componente 1: Informe a largura.");
  });

  it("recusa comprimento zerado", () => {
    expect(validarComponente(area({ length: "0" }), 0)).toContain("o comprimento deve ser maior que zero");
  });
});

describe("componente direto", () => {
  it("aceita quantidade válida", () => {
    expect(validarComponente(comp({ quantity: "2" }), 0)).toBeNull();
  });

  it("aceita quantidade escrita em pt-BR", () => {
    expect(validarComponente(comp({ quantity: "1,5" }), 0)).toBeNull();
  });

  it("recusa quantidade zerada", () => {
    expect(validarComponente(comp({ quantity: "0" }), 0)).toContain("a quantidade deve ser maior que zero");
  });
});

describe("referência do componente", () => {
  it("exige insumo ou produto escolhido", () => {
    expect(validarComponente(comp({ refId: "" }), 0)).toBe("Componente 1: escolha o insumo ou produto.");
  });
});

describe("validarFicha — ficha inteira", () => {
  it("ficha válida não reporta problema", () => {
    expect(validarFicha([comp({}), comp({ quantity_type: "lot", lot_size: "150" })])).toBeNull();
  });

  it("aponta o número do componente com problema", () => {
    const msg = validarFicha([comp({}), comp({ quantity_type: "lot", lot_size: "0" })]);
    expect(msg).toBe("Componente 2: o tamanho do lote deve ser maior que zero.");
  });

  it("ficha vazia é recusada", () => {
    expect(validarFicha([])).toBe("A ficha técnica precisa de ao menos um componente.");
  });
});

// ---------- Expressão do consumo (memória de cálculo) ----------
// A ficha guarda a expressão, não só o número final: é o que responde
// "de onde veio 1,212121?" um ano depois (Calculations.md §3).

describe("descreverQuantidade", () => {
  const q = (o: Partial<QuantidadeArmazenada>): QuantidadeArmazenada => ({
    quantity_type: "direct", quantity: null, width: null, length: null,
    yield_rate: null, lot_size: null, ...o,
  });

  it("área com rendimento reproduz a conta do Campo Catarata", () => {
    expect(descreverQuantidade(q({ quantity_type: "area", width: "1", length: "1.2", yield_rate: "0.99" })))
      .toBe("1 × 1,2 ÷ 0,99");
  });

  it("área com rendimento 1 omite a divisão (não agrega informação)", () => {
    expect(descreverQuantidade(q({ quantity_type: "area", width: "2", length: "3", yield_rate: "1" })))
      .toBe("2 × 3");
  });

  it("área sem rendimento informado também omite", () => {
    expect(descreverQuantidade(q({ quantity_type: "area", width: "2", length: "3" }))).toBe("2 × 3");
  });

  it("lote vira 1 ÷ tamanho (uma caixa serve 150 unidades)", () => {
    expect(descreverQuantidade(q({ quantity_type: "lot", lot_size: "150" }))).toBe("1 ÷ 150");
  });

  it("direta mostra o número em pt-BR", () => {
    expect(descreverQuantidade(q({ quantity: "1.5" }))).toBe("1,5");
  });

  it("explica o significado de cada tipo", () => {
    expect(explicarQuantidade(q({ quantity_type: "area" }))).toContain("rendimento");
    expect(explicarQuantidade(q({ quantity_type: "lot" }))).toContain("rende");
    expect(explicarQuantidade(q({}))).toBe("quantidade direta");
  });
});
