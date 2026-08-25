import { describe, expect, it } from "vitest";
import { devoRegistrarErroDeTela } from "@app/lib/db/observabilidade";

// ============================================================
// Erro de tela: registrar sem virar ruído (25/08/2026)
// ============================================================
//
// Um erro de SQL cru chegou a uma vendedora e o sistema não soube — a equipe
// descobriu por print no WhatsApp. Passar a registrar erro tratado resolve a
// cegueira, mas cria o risco oposto: consulta que se repete a cada minuto
// gravaria a mesma linha 60 vezes por hora e afogaria a tela de Monitoramento.

const DEZ_MINUTOS = 10 * 60 * 1000;

describe("devoRegistrarErroDeTela", () => {
  it("erro inédito é sempre registrado", () => {
    expect(devoRegistrarErroDeTela("/pedidos|falhou", 1_000, new Map())).toBe(true);
  });

  it("o mesmo erro logo em seguida não repete", () => {
    const ultimos = new Map([["/pedidos|falhou", 1_000]]);
    expect(devoRegistrarErroDeTela("/pedidos|falhou", 1_000 + 60_000, ultimos)).toBe(false);
  });

  it("passados os dez minutos, volta a registrar", () => {
    // Continua sendo sinal: se ainda acontece meia hora depois, não foi
    // um tropeço de rede.
    const ultimos = new Map([["/pedidos|falhou", 1_000]]);
    expect(devoRegistrarErroDeTela("/pedidos|falhou", 1_000 + DEZ_MINUTOS, ultimos)).toBe(true);
  });

  it("erro diferente na mesma tela não é silenciado pelo anterior", () => {
    const ultimos = new Map([["/pedidos|falhou", 1_000]]);
    expect(devoRegistrarErroDeTela("/pedidos|outro erro", 1_000 + 1, ultimos)).toBe(true);
  });

  it("o mesmo texto em outra tela conta separado", () => {
    // Caminho faz parte da chave: o mesmo erro no simulador e na ficha são
    // dois problemas, e quem investiga precisa ver os dois.
    const ultimos = new Map([["/pedidos|falhou", 1_000]]);
    expect(devoRegistrarErroDeTela("/simulador|falhou", 1_000 + 1, ultimos)).toBe(true);
  });
});
