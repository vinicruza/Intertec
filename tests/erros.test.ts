import { describe, expect, it } from "vitest";
import { mensagemDeErro, traduzErro, traduzErroDoBanco } from "@app/lib/erros";

// A tela de login já mostrou "{}" para um usuário real: o serviço de
// autenticação falhou por dentro, devolveu corpo vazio, e a mensagem crua foi
// parar na tela. Estes testes existem para isso não voltar.

describe("mensagem de erro de acesso", () => {
  it("nunca devolve sobra de serializador", () => {
    for (const cru of ["{}", "[]", "{ }", '""', "", "   ", null, undefined]) {
      const msg = traduzErro(cru);
      expect(msg, String(cru)).not.toMatch(/^[[{("']*[\]})"']*$/);
      expect(msg.length, String(cru)).toBeGreaterThan(10);
    }
  });

  it("separa culpa da senha de falha do serviço", () => {
    expect(traduzErro("Invalid login credentials")).toBe("E-mail ou senha incorretos.");
    // 500 do serviço não pode virar "senha incorreta": mandaria a pessoa
    // tentar a senha certa a noite inteira.
    const falha = traduzErro("unexpected_failure");
    expect(falha).not.toMatch(/senha incorreta|incorretos/i);
    expect(falha).toMatch(/administrador/i);
  });

  it("preserva mensagem que já é uma frase legível", () => {
    expect(traduzErro("A nova senha é curta demais.")).toBe("A nova senha é curta demais.");
  });

  it("traduz os casos conhecidos de senha e conexão", () => {
    expect(traduzErro("Password should be at least 8 characters")).toMatch(/curta demais/i);
    expect(traduzErro("New password should be different from the old password")).toMatch(
      /diferente da atual/i,
    );
    expect(traduzErro("Failed to fetch")).toMatch(/conexão/i);
  });
});

describe("mensagemDeErro", () => {
  // O motivo de existir: o Supabase rejeita RPC com um objeto simples, não com
  // uma instância de Error. Em 19/08/2026 isso transformou "Fechamento
  // rejeitado: totais enviados não reconciliam com os dados do pedido" em
  // "Erro ao gerar pedido." na tela, e o vendedor ficou sem saber o que houve.
  it("aproveita a mensagem de um PostgrestError, que não é instância de Error", () => {
    const erroDoSupabase = {
      message: "Fechamento rejeitado: totais enviados não reconciliam com os dados do pedido",
      code: "P0001",
      details: null,
      hint: null,
    };
    expect(mensagemDeErro(erroDoSupabase, "Erro ao gerar pedido.")).toBe(
      "Fechamento rejeitado: totais enviados não reconciliam com os dados do pedido"
    );
  });

  it("aproveita a mensagem de um Error comum", () => {
    expect(mensagemDeErro(new Error("Pedido já está fechado."), "padrão")).toBe("Pedido já está fechado.");
  });

  it("cai no texto padrão quando não há frase alguma", () => {
    expect(mensagemDeErro({ message: "{}" }, "padrão")).toBe("padrão");
    expect(mensagemDeErro(new Error(""), "padrão")).toBe("padrão");
    expect(mensagemDeErro(null, "padrão")).toBe("padrão");
    expect(mensagemDeErro("texto solto", "padrão")).toBe("padrão");
  });
});

// O Postgres recusa com o NOME da trava, em inglês e em jargão. Cada trava
// alcançável por um formulário precisa virar uma frase que aponta o campo e a
// saída — nunca o nome da trava na tela da vendedora.
describe("traduzErroDoBanco", () => {
  const doBanco = (message: string, code = "23514") => ({ message, code, details: null, hint: null });

  it("traduz o CEP do pedido — o caso que originou a revisão", () => {
    const e = doBanco(
      'new row for relation "orders" violates check constraint "orders_shipping_zip_formato"'
    );
    expect(traduzErroDoBanco(e)).toBe(
      "O CEP de entrega precisa ter 8 dígitos. Deixe em branco para usar o CEP do cadastro do cliente."
    );
  });

  it("traduz CNPJ, telefone e quantidade", () => {
    expect(traduzErroDoBanco(doBanco('violates check constraint "customers_tax_id_formato"'))).toMatch(
      /CNPJ precisa ter 14 dígitos/
    );
    expect(traduzErroDoBanco(doBanco('violates check constraint "customers_phone_formato"'))).toMatch(
      /10 ou 11 dígitos, com o DDD/
    );
    expect(traduzErroDoBanco(doBanco('violates check constraint "order_items_quantity_check"'))).toMatch(
      /maior que zero/
    );
  });

  it("nunca deixa o nome da trava chegar à tela", () => {
    const nomes = [
      "orders_shipping_zip_formato",
      "customers_tax_id_formato",
      "kit_packaging_quantity_shape",
      "products_tenant_id_code_key",
    ];
    for (const nome of nomes) {
      const saida = traduzErroDoBanco(doBanco(`violates check constraint "${nome}"`));
      expect(saida).not.toBeNull();
      expect(saida).not.toContain(nome);
      expect(saida).not.toMatch(/constraint|relation|violates/i);
    }
  });

  it("trava desconhecida ainda sai em português, sem jargão", () => {
    const saida = traduzErroDoBanco(doBanco('violates check constraint "trava_que_nao_mapeei"'));
    expect(saida).toBe("Algum campo está fora do formato esperado. Confira os dados digitados.");
  });

  it("registro repetido, campo obrigatório e permissão têm cada um a sua frase", () => {
    expect(traduzErroDoBanco(doBanco("duplicate key value", "23505"))).toMatch(/já existe um registro/i);
    expect(traduzErroDoBanco(doBanco("null value in column", "23502"))).toMatch(/campo obrigatório/i);
    expect(traduzErroDoBanco(doBanco("permission denied", "42501"))).toMatch(/perfil de acesso/i);
  });

  it("erro que não é do banco passa direto", () => {
    expect(traduzErroDoBanco(new Error("Cotação incompleta."))).toBeNull();
    expect(traduzErroDoBanco(null)).toBeNull();
  });

  it("mensagemDeErro usa a tradução antes de qualquer outra coisa", () => {
    const e = doBanco('violates check constraint "orders_volumes_check"');
    expect(mensagemDeErro(e, "Erro ao salvar.")).toBe("A quantidade de volumes precisa ser maior que zero.");
  });
});
