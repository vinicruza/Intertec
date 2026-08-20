import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cepValido,
  cnpjCpfValido,
  cnpjValido,
  cpfValido,
  emailPlausivel,
  formatarCep,
  formatarCnpjCpf,
  formatarTelefone,
  somenteDigitos,
  telefoneValido,
} from "../../lib/cadastro/documentos";

// Documentos do formulário de pedido (05/08/2026). O que se protege aqui é o
// erro de digitação que só apareceria na recusa da nota fiscal.

describe("somenteDigitos", () => {
  it("descarta qualquer pontuação", () => {
    expect(somenteDigitos("11.222.333/0001-81")).toBe("11222333000181");
    expect(somenteDigitos("(11) 98765-4321")).toBe("11987654321");
    expect(somenteDigitos(null)).toBe("");
    expect(somenteDigitos(undefined)).toBe("");
  });
});

describe("cpfValido", () => {
  it("aceita CPF com dígito verificador correto", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
  });

  it("recusa dígito verificador errado", () => {
    expect(cpfValido("529.982.247-26")).toBe(false);
  });

  it("recusa tamanho errado", () => {
    expect(cpfValido("5299822472")).toBe(false);
    expect(cpfValido("529982247250")).toBe(false);
    expect(cpfValido("")).toBe(false);
  });

  // 111.111.111-11 fecha no módulo 11 por acidente aritmético. Sem esta
  // guarda, o campo aceitaria um documento que não existe.
  it("recusa sequência de dígitos repetidos", () => {
    expect(cpfValido("11111111111")).toBe(false);
    expect(cpfValido("00000000000")).toBe(false);
  });
});

describe("cnpjValido", () => {
  it("aceita CNPJ com dígito verificador correto", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11222333000181")).toBe(true);
  });

  it("recusa dígito verificador errado", () => {
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
  });

  it("recusa tamanho errado e repetição", () => {
    expect(cnpjValido("1122233300018")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
  });
});

describe("cnpjCpfValido", () => {
  // A Intertech vende para hospital (CNPJ) e para profissional autônomo (CPF).
  it("aceita os dois formatos pelo tamanho", () => {
    expect(cnpjCpfValido("529.982.247-25")).toBe(true);
    expect(cnpjCpfValido("11.222.333/0001-81")).toBe(true);
  });

  it("recusa número que não é nem um nem outro", () => {
    expect(cnpjCpfValido("123")).toBe(false);
    expect(cnpjCpfValido("123456789012")).toBe(false);
  });
});

describe("formatarCnpjCpf", () => {
  it("aplica a máscara conforme o tamanho", () => {
    expect(formatarCnpjCpf("52998224725")).toBe("529.982.247-25");
    expect(formatarCnpjCpf("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("devolve o número cru quando ainda está incompleto", () => {
    expect(formatarCnpjCpf("1122233")).toBe("1122233");
    expect(formatarCnpjCpf(null)).toBe("");
  });
});

describe("CEP", () => {
  it("valida por tamanho", () => {
    expect(cepValido("01310-100")).toBe(true);
    expect(cepValido("01310100")).toBe(true);
    expect(cepValido("0131010")).toBe(false);
  });

  it("formata com hífen", () => {
    expect(formatarCep("01310100")).toBe("01310-100");
    expect(formatarCep("0131")).toBe("0131");
  });
});

describe("telefone", () => {
  it("aceita fixo e celular", () => {
    expect(telefoneValido("1134567890")).toBe(true);
    expect(telefoneValido("11987654321")).toBe(true);
    expect(telefoneValido("119876543")).toBe(false);
  });

  it("formata conforme o tamanho", () => {
    expect(formatarTelefone("11987654321")).toBe("(11) 98765-4321");
    expect(formatarTelefone("1134567890")).toBe("(11) 3456-7890");
    expect(formatarTelefone("119")).toBe("119");
  });
});

describe("emailPlausivel", () => {
  it("aceita endereço bem formado", () => {
    expect(emailPlausivel("compras@hospital.com.br")).toBe(true);
  });

  it("recusa o erro de digitação grosseiro", () => {
    expect(emailPlausivel("compras")).toBe(false);
    expect(emailPlausivel("compras@hospital")).toBe(false);
    expect(emailPlausivel("compras @hospital.com")).toBe(false);
    expect(emailPlausivel("")).toBe(false);
    expect(emailPlausivel(null)).toBe(false);
  });
});

// O banco exige CEP com 8 dígitos ou nulo (constraint
// `orders_shipping_zip_formato`). A tela de editar pedido já barrava; o
// SIMULADOR não. Em 19/08/2026 uma vendedora digitou "42" e levou na tela
// 'new row for relation "orders" violates check constraint
// "orders_shipping_zip_formato"' — erro cru do Postgres, que não diz o que
// fazer nem que o campo pode ficar em branco.
describe("CEP de entrega no simulador", () => {
  const fonte = readFileSync("app/pages/SimuladorPage.tsx", "utf8");

  it("barra antes de gravar, com o número de dígitos que faltam", () => {
    expect(fonte).toMatch(/precisa ter 8 dígitos/);
    expect(fonte).toMatch(/cepDigitos !== "" && !cepValido\(cepDigitos\)/);
  });

  it("manda só os dígitos, para o CEP digitado com traço passar", () => {
    expect(fonte).toMatch(/cepEntrega: cepDigitos === "" \? null : cepDigitos/);
  });

  it("em branco continua valendo — usa o CEP do cadastro", () => {
    expect(fonte).toMatch(/Em branco, vale o do cadastro do cliente/);
  });
});
