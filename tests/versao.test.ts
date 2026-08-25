import { describe, expect, it } from "vitest";
import { haVersaoNova, podeRecarregarSozinho } from "@app/lib/versao";

// ============================================================
// Atualização automática (25/08/2026)
// ============================================================
//
// Nasceu de uma vendedora passar a manhã com o DIFAL zerado numa aba aberta
// antes da correção ser publicada. O sistema estava certo; a aba dela é que
// segurava o código velho, e a única saída era alguém avisar por WhatsApp.
//
// O que se protege aqui é o FALSO POSITIVO. Recarregar apaga o que estiver
// digitado e não salvo: errar para mais estraga um pedido inteiro, errar para
// menos só mantém o comportamento que já existia.

describe("haVersaoNova", () => {
  it("números diferentes: saiu versão nova", () => {
    expect(haVersaoNova("abc123", "def456")).toBe(true);
  });

  it("números iguais: nada a fazer", () => {
    expect(haVersaoNova("abc123", "abc123")).toBe(false);
  });

  it("sem resposta do servidor não é versão nova", () => {
    // Internet caída, 404, JSON quebrado — tudo chega aqui como null. Tratar
    // isso como "saiu versão" recarregaria a tela a cada oscilação de rede.
    expect(haVersaoNova("abc123", null)).toBe(false);
    expect(haVersaoNova("abc123", "")).toBe(false);
  });

  it("sem saber a própria versão, não decide", () => {
    // Acontece no servidor de desenvolvimento, onde o build não carimba nada.
    expect(haVersaoNova("desconhecida", "def456")).toBe(false);
    expect(haVersaoNova("", "def456")).toBe(false);
  });
});

describe("podeRecarregarSozinho", () => {
  const base = { temVersaoNova: true, rotaMudou: true, caminho: "/pedidos" };

  it("versão nova + troca de tela: entra sozinha", () => {
    expect(podeRecarregarSozinho(base)).toBe(true);
  });

  it("parado na mesma tela: não recarrega", () => {
    // É aqui que mora o pedido pela metade. Quem está parado recebe o aviso e
    // decide a hora.
    expect(podeRecarregarSozinho({ ...base, rotaMudou: false })).toBe(false);
  });

  it("sem versão nova, trocar de tela não recarrega nada", () => {
    expect(podeRecarregarSozinho({ ...base, temVersaoNova: false })).toBe(false);
  });

  it("a ficha nunca é recarregada: estragaria a impressão", () => {
    expect(podeRecarregarSozinho({ ...base, caminho: "/pedidos/123/ficha" })).toBe(false);
  });
});
