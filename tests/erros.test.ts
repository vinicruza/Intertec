import { describe, expect, it } from "vitest";
import { mensagemDeErro, traduzErro } from "@app/lib/erros";

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
