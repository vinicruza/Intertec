import { describe, expect, it } from "vitest";
import {
  CAMPOS_OBRIGATORIOS,
  ROTULOS_OBRIGATORIOS,
  faltaDocumento,
  obrigatoriosPendentes,
} from "../../lib/cadastro/obrigatorios";

// ============================================================
// Campos obrigatórios do cliente (Intertech, 02/09/2026)
// ============================================================
//
// Nasceu da Santa Casa de Igarapava aparecer duas vezes: um cadastro sem CNPJ,
// e outro criado 30 minutos depois com o nome digitado errado. Sem documento,
// a única defesa contra o repetido é o nome — e nome se digita errado.

const COMPLETO = Object.fromEntries(CAMPOS_OBRIGATORIOS.map((c) => [c, "x"])) as Record<string, string>;

describe("obrigatoriosPendentes", () => {
  it("cadastro completo não tem pendência", () => {
    expect(obrigatoriosPendentes(COMPLETO)).toEqual([]);
  });

  it("acusa o campo que falta, e só ele", () => {
    expect(obrigatoriosPendentes({ ...COMPLETO, tax_id: "" })).toEqual(["tax_id"]);
    expect(obrigatoriosPendentes({ ...COMPLETO, shipping_city: "  " })).toEqual(["shipping_city"]);
  });

  it("cadastro vazio acusa todos", () => {
    expect(obrigatoriosPendentes({})).toHaveLength(CAMPOS_OBRIGATORIOS.length);
  });

  it("devolve na ordem da tela, para a lista ser lida como o formulário", () => {
    const p = obrigatoriosPendentes({ ...COMPLETO, commercial_email: "", name: "", tax_id: "" });
    expect(p).toEqual(["name", "tax_id", "commercial_email"]);
  });

  it("espaço em branco não conta como preenchido", () => {
    expect(obrigatoriosPendentes({ ...COMPLETO, name: "   " })).toEqual(["name"]);
  });
});

describe("o que fica de fora, e por quê", () => {
  // Campo obrigatório demais não produz cadastro completo: produz cadastro
  // inventado. Na base de 02/09 o contato financeiro faltava em 77 dos 143
  // clientes ativos — exigi-lo travaria a edição de mais da metade.
  it("o contato financeiro segue opcional", () => {
    for (const campo of ["financial_contact_name", "financial_phone", "financial_email"]) {
      expect(CAMPOS_OBRIGATORIOS).not.toContain(campo);
    }
  });

  it("o contato principal do banco não é exigido: não existe no formulário", () => {
    // Ele é copiado do comercial ao salvar. Exigir o nome do banco pediria à
    // pessoa um campo que ela não vê.
    for (const campo of ["contact_name", "phone", "email"]) {
      expect(CAMPOS_OBRIGATORIOS).not.toContain(campo);
    }
    expect(CAMPOS_OBRIGATORIOS).toContain("commercial_contact_name");
  });

  it("complemento e observação seguem opcionais", () => {
    for (const campo of ["billing_complement", "shipping_complement", "notes"]) {
      expect(CAMPOS_OBRIGATORIOS).not.toContain(campo);
    }
  });
});

describe("faltaDocumento", () => {
  // Tem frase própria na tela: é o campo que existe para impedir o repetido,
  // e a pessoa precisa saber disso, não só ver um vermelho.
  it("aponta o CNPJ vazio", () => {
    expect(faltaDocumento({ ...COMPLETO, tax_id: "" })).toBe(true);
    expect(faltaDocumento(COMPLETO)).toBe(false);
  });
});

describe("todo obrigatório tem rótulo em português", () => {
  it("nenhum campo aparece na tela como nome de coluna do banco", () => {
    for (const campo of CAMPOS_OBRIGATORIOS) {
      expect(ROTULOS_OBRIGATORIOS[campo]).toBeTruthy();
      expect(ROTULOS_OBRIGATORIOS[campo]).not.toMatch(/_/);
    }
  });
});
