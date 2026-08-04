import { describe, expect, it } from "vitest";
import { traduzErro } from "@app/lib/erros";

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
